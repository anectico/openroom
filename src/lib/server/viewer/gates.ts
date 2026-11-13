import { randomInt } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import type { LinkSettings } from '../../schemas/link-settings.ts';
import { notify, recordEvent } from '../activity.ts';
import { database } from '../db/index.ts';
import {
	capReached,
	codesLastDay,
	dailyCap,
	EmailError,
	emailReady,
	sendEmail,
	sentLastDay,
} from '../email.ts';
import { emailCopy } from '../email-copy.ts';
import { normaliseEmail } from '../emails.ts';
import { newId } from '../ids.ts';
import type { RoomRow } from '../rooms.ts';
import { deriveKey, hmacWith, randomToken, safeEqual, sha256 } from '../secrets.ts';
import { createSession, type LinkRow, linkActive, linkById, mayEnter, upsertViewer } from './access.ts';
import { hit, ipKey, limits } from './ratelimit.ts';

export type GateRow = {
	id: string;
	link_id: string;
	viewer_email: string | null;
	allowed: number;
	password_ok: number;
	verified: number;
	fields_json: string | null;
	expires_at: number;
};

export type Step = 'password' | 'email' | 'code' | 'fields' | 'nda' | 'done';

export const gateCookie = (linkId: string) => `og_${linkId}`;
export const gateTtlMs = 30 * 60_000;
const codeTtlMs = 10 * 60_000;
const resendAfterMs = 60_000;
const sendsPerEmailIpPerDay = 10;
const sendsPerEmailPerDay = 30;
const sendsPerLinkPerDay = 300;
const attemptsPerCode = 5;
const attemptsPerEmailIpPerDay = 20;
const attemptsPerEmailPerDay = 100;
const attemptsPerLinkPerDay = 200;
const day = 86_400_000;
const codeShareOfCap = 0.6;

const sqlite = () => database().sqlite;

export function loadGate(link: LinkRow, token: string | undefined) {
	if (!token) return null;
	return (
		(sqlite()
			.prepare('SELECT * FROM gate_progress WHERE token_hash = ? AND link_id = ? AND expires_at > ?')
			.get(sha256(token), link.id, Date.now()) as GateRow | undefined) ?? null
	);
}

export function startGate(link: LinkRow, ip: string | null) {
	const token = randomToken();
	const now = Date.now();
	sqlite()
		.prepare(
			'INSERT INTO gate_progress (id, link_id, token_hash, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
		)
		.run(newId('gate'), link.id, sha256(token), ip, now, now + gateTtlMs);
	return token;
}

export function fieldsOf(gate: GateRow) {
	return gate.fields_json ? (JSON.parse(gate.fields_json) as Record<string, string>) : null;
}

export function nextStep(link: LinkRow, settings: LinkSettings, gate: GateRow | null): Step {
	if (link.password_hash && !gate?.password_ok) return 'password';
	if (!gate?.viewer_email) return 'email';
	if (settings.verifyEmail && !gate.verified) return 'code';
	if (settings.customFields.length && !gate.fields_json) return 'fields';
	if (settings.requireNda) return 'nda';
	return 'done';
}

export async function checkPassword(gate: GateRow, link: LinkRow, password: string, ip: string | null) {
	if (!hit(`pw:${link.id}:${ipKey(ip)}`, limits.password.max, limits.password.windowMs))
		return 'limited' as const;
	if (!hit(`pw:${link.id}`, limits.passwordLink.max, limits.passwordLink.windowMs)) return 'limited' as const;
	if (!link.password_hash || !(await verifyPassword({ hash: link.password_hash, password })))
		return 'wrong' as const;
	const current = linkById(link.id);
	if (!linkActive(current) || current?.password_hash !== link.password_hash) return 'wrong' as const;
	sqlite().prepare('UPDATE gate_progress SET password_ok = 1 WHERE id = ?').run(gate.id);
	return 'ok' as const;
}

export function setEmail(gate: GateRow, link: LinkRow, settings: LinkSettings, raw: string) {
	const email = normaliseEmail(raw);
	if (!email) return { error: 'invalid' as const };
	const allowed = mayEnter(link, email);
	if (!allowed && !settings.verifyEmail) return { error: 'not_allowed' as const };
	sqlite()
		.prepare(
			'UPDATE gate_progress SET viewer_email = ?, allowed = ?, verified = 0, fields_json = NULL WHERE id = ?',
		)
		.run(email, allowed ? 1 : 0, gate.id);
	return { email };
}

export function clearEmail(gate: GateRow) {
	sqlite()
		.prepare(
			'UPDATE gate_progress SET viewer_email = NULL, allowed = 0, verified = 0, fields_json = NULL WHERE id = ?',
		)
		.run(gate.id);
}

function codeHash(gateId: string, code: string) {
	return hmacWith(deriveKey('verification codes'), `${gateId}:${code}`);
}

function lastCode(gate: GateRow) {
	return sqlite()
		.prepare(
			'SELECT * FROM verification_codes WHERE gate_id = ? AND viewer_email = ? ORDER BY sent_at DESC LIMIT 1',
		)
		.get(gate.id, gate.viewer_email ?? '') as
		| { id: string; code_hash: string | null; attempts: number; sent_at: number; expires_at: number }
		| undefined;
}

export function resendIn(gate: GateRow) {
	const last = lastCode(gate);
	return last ? Math.max(0, Math.ceil((last.sent_at + resendAfterMs - Date.now()) / 1000)) : 0;
}

export type SendResult = 'sent' | 'cooldown' | 'daily' | 'unavailable';

export function sendCode(gate: GateRow, link: LinkRow, room: RoomRow, ip: string | null): SendResult {
	const email = gate.viewer_email;
	if (!email || !emailReady()) return 'unavailable';
	const now = Date.now();
	if (resendIn(gate) > 0) return 'cooldown';
	const count = (sql: string, ...args: unknown[]) =>
		(
			sqlite()
				.prepare(sql)
				.get(...args) as { n: number }
		).n;
	const bucket = ipKey(ip);
	if (
		count(
			'SELECT count(*) AS n FROM verification_codes WHERE viewer_email = ? AND ip = ? AND sent_at > ?',
			email,
			bucket,
			now - day,
		) >= sendsPerEmailIpPerDay ||
		count(
			'SELECT count(*) AS n FROM verification_codes WHERE viewer_email = ? AND sent_at > ?',
			email,
			now - day,
		) >= sendsPerEmailPerDay
	)
		return 'daily';
	if (
		count(
			'SELECT count(*) AS n FROM verification_codes WHERE link_id = ? AND sent_at > ?',
			link.id,
			now - day,
		) >= sendsPerLinkPerDay
	)
		return 'daily';
	if (!hit(`code-send:${bucket}`, limits.codeSendIp.max, limits.codeSendIp.windowMs)) return 'daily';
	if (codesLastDay() >= Math.floor(dailyCap() * codeShareOfCap)) return 'unavailable';
	if (sentLastDay() >= dailyCap()) {
		capReached();
		return 'unavailable';
	}
	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	if (gate.allowed) {
		try {
			sendEmail(
				email,
				emailCopy.verificationCode({ code, room: room.name, minutes: codeTtlMs / 60_000 }),
				'email.code',
			);
		} catch (e) {
			if (e instanceof EmailError) return 'unavailable';
			throw e;
		}
	}
	sqlite()
		.prepare(
			'INSERT INTO verification_codes (id, gate_id, link_id, viewer_email, ip, code_hash, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		)
		.run(
			newId('code'),
			gate.id,
			link.id,
			email,
			bucket,
			gate.allowed ? codeHash(gate.id, code) : null,
			now,
			now + codeTtlMs,
		);
	return 'sent';
}

export type CodeResult = { result: 'ok' | 'wrong' | 'expired' | 'used_up' | 'daily'; attemptsLeft: number };

export function checkCode(gate: GateRow, link: LinkRow, raw: string, ip: string | null): CodeResult {
	const current = sqlite()
		.prepare('SELECT viewer_email FROM gate_progress WHERE id = ? AND link_id = ? AND expires_at > ?')
		.get(gate.id, link.id, Date.now()) as { viewer_email: string | null } | undefined;
	if (!current || current.viewer_email !== gate.viewer_email) return { result: 'expired', attemptsLeft: 0 };
	const code = raw.replace(/\D/g, '');
	const last = lastCode(gate);
	const now = Date.now();
	if (!last || last.expires_at <= now) return { result: 'expired', attemptsLeft: 0 };
	if (last.attempts >= attemptsPerCode) return { result: 'used_up', attemptsLeft: 0 };
	const sum = (sql: string, ...args: unknown[]) =>
		(
			sqlite()
				.prepare(sql)
				.get(...args) as { n: number | null }
		).n ?? 0;
	const email = gate.viewer_email ?? '';
	if (
		sum(
			'SELECT sum(attempts) AS n FROM verification_codes WHERE viewer_email = ? AND ip = ? AND sent_at > ?',
			email,
			ipKey(ip),
			now - day,
		) >= attemptsPerEmailIpPerDay ||
		sum(
			'SELECT sum(attempts) AS n FROM verification_codes WHERE viewer_email = ? AND sent_at > ?',
			email,
			now - day,
		) >= attemptsPerEmailPerDay ||
		sum(
			'SELECT sum(attempts) AS n FROM verification_codes WHERE link_id = ? AND sent_at > ?',
			link.id,
			now - day,
		) >= attemptsPerLinkPerDay
	)
		return { result: 'daily', attemptsLeft: 0 };
	sqlite().prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?').run(last.id);
	const attemptsLeft = attemptsPerCode - last.attempts - 1;
	if (last.code_hash && code.length === 6 && safeEqual(last.code_hash, codeHash(gate.id, code))) {
		sqlite().prepare('UPDATE gate_progress SET verified = 1 WHERE id = ?').run(gate.id);
		sqlite().prepare('UPDATE verification_codes SET expires_at = ? WHERE id = ?').run(now, last.id);
		return { result: 'ok', attemptsLeft };
	}
	return { result: attemptsLeft > 0 ? 'wrong' : 'used_up', attemptsLeft };
}

export function setFields(gate: GateRow, settings: LinkSettings, values: Record<string, string>) {
	const fields: Record<string, string> = {};
	const missing: string[] = [];
	for (const f of settings.customFields) {
		const value = (values[f.label] ?? '').trim().slice(0, 300);
		if (f.required && !value) missing.push(f.label);
		fields[f.label] = value;
	}
	if (missing.length) return { missing };
	sqlite()
		.prepare('UPDATE gate_progress SET fields_json = ? WHERE id = ?')
		.run(JSON.stringify(fields), gate.id);
	return { missing: [] };
}

export function previousAcceptance(email: string, roomId: string) {
	return sqlite()
		.prepare(
			'SELECT accepted_at, nda_version_id FROM nda_acceptances WHERE email = ? AND room_id = ? ORDER BY accepted_at DESC LIMIT 1',
		)
		.get(email, roomId) as { accepted_at: number; nda_version_id: string } | undefined;
}

export function recordAcceptance(input: {
	viewerId: string | null;
	sessionId: string;
	verified: boolean;
	linkId: string;
	roomId: string;
	ndaVersionId: string;
	name: string;
	email: string;
	ip: string | null;
	userAgent: string | null;
}) {
	sqlite()
		.prepare(
			`INSERT INTO nda_acceptances (id, viewer_id, session_id, verified, link_id, room_id, nda_version_id, name, email, ip, user_agent, accepted_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			newId('nda'),
			input.viewerId,
			input.sessionId,
			input.verified ? 1 : 0,
			input.linkId,
			input.roomId,
			input.ndaVersionId,
			input.name,
			input.email,
			input.ip,
			input.userAgent?.slice(0, 300) ?? null,
			Date.now(),
		);
}

export function finishGate(
	gate: GateRow,
	link: LinkRow,
	room: RoomRow,
	settings: LinkSettings,
	request: { ip: string | null; userAgent: string | null },
	ndaName: string | null,
) {
	const email = gate.viewer_email;
	if (!email || !gate.allowed || !mayEnter(link, email)) return null;
	const verified = settings.verifyEmail && !!gate.verified;
	const result = sqlite()
		.transaction(() => {
			const viewerId = upsertViewer(email);
			const ndaVersionId = settings.requireNda ? room.current_nda_version_id : null;
			const session = createSession({
				linkId: link.id,
				viewerId,
				verified,
				fields: fieldsOf(gate),
				ndaVersionId,
				ip: request.ip,
				userAgent: request.userAgent,
			});
			if (ndaVersionId && ndaName)
				recordAcceptance({
					viewerId,
					sessionId: session.id,
					verified,
					linkId: link.id,
					roomId: room.id,
					ndaVersionId,
					name: ndaName,
					email,
					ip: request.ip,
					userAgent: request.userAgent,
				});
			sqlite().prepare('DELETE FROM gate_progress WHERE id = ?').run(gate.id);
			return { ...session, viewerId, ndaVersionId };
		})
		.immediate();
	const base = { roomId: room.id, linkId: link.id, viewerId: result.viewerId };
	const earlier = sqlite()
		.prepare('SELECT 1 FROM viewer_sessions WHERE viewer_id = ? AND link_id = ? AND id != ?')
		.get(result.viewerId, link.id, result.id);
	recordEvent({ ...base, kind: 'visit', sessionId: result.id, detail: { verified } });
	if (!earlier) notify('first_open', base);
	else if (settings.notifyEveryView) notify('visit', base);
	if (result.ndaVersionId && ndaName) {
		recordEvent({ ...base, kind: 'nda_accepted', sessionId: result.id });
		notify('nda_accepted', base);
	}
	return result;
}

export function cleanupGates() {
	const now = Date.now();
	sqlite().prepare('DELETE FROM gate_progress WHERE expires_at < ?').run(now);
	sqlite()
		.prepare('DELETE FROM verification_codes WHERE expires_at < ?')
		.run(now - day);
	sqlite()
		.prepare(
			'DELETE FROM viewer_sessions WHERE expires_at < ? AND ended_at IS NULL AND preview_by IS NOT NULL',
		)
		.run(now);
}
