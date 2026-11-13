import { error, fail, redirect } from '@sveltejs/kit';
import { brandingFor } from '#lib/server/branding.ts';
import { database } from '#lib/server/db/index.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import { findRoom } from '#lib/server/rooms.ts';
import {
	checkSession,
	effectiveSettings,
	type LinkRow,
	linkByToken,
	sessionCookie,
} from '#lib/server/viewer/access.ts';
import {
	checkCode,
	checkPassword,
	clearEmail,
	finishGate,
	gateCookie,
	gateTtlMs,
	loadGate,
	nextStep,
	previousAcceptance,
	resendIn,
	sendCode,
	setEmail,
	setFields,
	startGate,
} from '#lib/server/viewer/gates.ts';
import { cookieOptions } from '#lib/server/viewer/http.ts';
import { hit, ipKey, limits } from '#lib/server/viewer/ratelimit.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function resolve(event: RequestEvent | Parameters<PageServerLoad>[0]) {
	const ip = event.getClientAddress();
	if (!hit(`token:${ipKey(ip)}`, limits.tokenLookup.max, limits.tokenLookup.windowMs))
		error(404, 'unavailable');
	const link = linkByToken(event.params.token);
	const room = link ? findRoom(link.room_id) : undefined;
	if (!link || !room) error(404, 'unavailable');
	return { link, room, settings: effectiveSettings(link, room), ip };
}

function gateFor(event: RequestEvent, link: LinkRow) {
	const gate = loadGate(link, event.cookies.get(gateCookie(link.id)));
	if (!gate) redirect(303, event.url.pathname);
	return gate;
}

function complete(event: RequestEvent) {
	const { link, room, settings, ip } = resolve(event);
	const gate = gateFor(event, link);
	if (nextStep(link, settings, gate) !== 'done') return;
	const session = finishGate(
		gate,
		link,
		room,
		settings,
		{ ip, userAgent: event.request.headers.get('user-agent') },
		null,
	);
	if (!session) error(404, 'unavailable');
	enter(event, link.id, session.token, session.expiresAt);
}

function enter(event: RequestEvent, linkId: string, token: string, expiresAt: number) {
	event.cookies.set(
		sessionCookie(linkId),
		token,
		cookieOptions(event.url, Math.floor((expiresAt - Date.now()) / 1000)),
	);
	event.cookies.delete(gateCookie(linkId), { path: '/' });
	redirect(303, `/v/${linkId}`);
}

export const load: PageServerLoad = async (event) => {
	const { link, room, settings, ip } = resolve(event);
	const existing = checkSession(link.id, event.cookies.get(sessionCookie(link.id)));
	if (existing.ok) redirect(303, `/v/${link.id}`);
	let gate = loadGate(link, event.cookies.get(gateCookie(link.id)));
	if (!gate) {
		const token = startGate(link, ip);
		event.cookies.set(gateCookie(link.id), token, cookieOptions(event.url, gateTtlMs / 1000));
		gate = loadGate(link, token);
	}
	const step = nextStep(link, settings, gate);
	const nda =
		step === 'nda' && room.current_nda_version_id
			? (database()
					.sqlite.prepare('SELECT body_markdown, created_at FROM nda_versions WHERE id = ?')
					.get(room.current_nda_version_id) as { body_markdown: string; created_at: number })
			: null;
	const accepted = nda && gate?.viewer_email ? previousAcceptance(gate.viewer_email, room.id) : null;
	return {
		step,
		roomName: room.name,
		branding: brandingFor(room),
		welcomeHtml: renderMarkdown(room.welcome_markdown),
		email: gate?.viewer_email ?? null,
		resendIn: step === 'code' && gate ? resendIn(gate) : 0,
		fields: settings.customFields,
		ndaHtml: nda ? renderMarkdown(nda.body_markdown) : null,
		ndaDate: nda?.created_at ?? null,
		ndaVersionId: step === 'nda' ? room.current_nda_version_id : null,
		ndaChanged: !!accepted && accepted.nda_version_id !== room.current_nda_version_id,
	};
};

export const actions: Actions = {
	password: async (event) => {
		const { link } = resolve(event);
		const gate = gateFor(event, link);
		const form = await event.request.formData();
		const r = await checkPassword(gate, link, String(form.get('password') ?? ''), event.getClientAddress());
		if (r === 'limited') return fail(429, { error: 'Too many tries. Wait 15 minutes and try again.' });
		if (r === 'wrong') return fail(400, { error: 'That password is not right.' });
		complete(event);
	},
	email: async (event) => {
		const { link, room, settings, ip } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'email') return;
		const form = await event.request.formData();
		const r = setEmail(gate, link, settings, String(form.get('email') ?? ''));
		if (r.error === 'invalid') return fail(400, { error: 'Enter a valid email address.' });
		if (r.error === 'not_allowed')
			return fail(403, {
				error:
					"This email doesn't have access to this room. Check the address or ask the person who sent you the link.",
			});
		if (settings.verifyEmail) {
			const sent = sendCode(gateFor(event, link), link, room, ip);
			if (sent === 'unavailable' || sent === 'daily') clearEmail(gate);
			if (sent === 'unavailable')
				return fail(503, {
					error:
						"We can't send codes right now. Try again later or contact the person who sent you the link.",
				});
			if (sent === 'daily') return fail(429, { error: 'Too many attempts. Try again tomorrow.' });
			if (sent === 'cooldown')
				return { notice: 'We already sent a code to this email; it works for 10 minutes.' };
		}
		complete(event);
	},
	resend: async (event) => {
		const { link, room, settings, ip } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'code') return;
		const sent = sendCode(gate, link, room, ip);
		if (sent === 'cooldown') return fail(429, { error: 'Wait a minute before asking for a new code.' });
		if (sent === 'daily') return fail(429, { error: 'Too many attempts. Try again tomorrow.' });
		if (sent === 'unavailable')
			return fail(503, {
				error: "We can't send codes right now. Try again later or contact the person who sent you the link.",
			});
		return { notice: 'We sent a new code.' };
	},
	code: async (event) => {
		const { link, settings } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'code') return;
		const form = await event.request.formData();
		const r = checkCode(gate, link, String(form.get('code') ?? ''), event.getClientAddress());
		if (r.result === 'daily') return fail(429, { error: 'Too many attempts. Try again tomorrow.' });
		if (r.result === 'expired') return fail(400, { error: 'This code has expired. Ask for a new code.' });
		if (r.result === 'used_up') return fail(400, { error: 'Too many wrong tries. Ask for a new code.' });
		if (r.result === 'wrong')
			return fail(400, {
				error:
					r.attemptsLeft <= 2
						? `That code is not right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`
						: 'That code is not right.',
			});
		complete(event);
	},
	change: async (event) => {
		const { link } = resolve(event);
		clearEmail(gateFor(event, link));
	},
	fields: async (event) => {
		const { link, settings } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'fields') return;
		const form = await event.request.formData();
		const values = Object.fromEntries(
			settings.customFields.map((f, i) => [f.label, String(form.get(`field-${i}`) ?? '')]),
		);
		const r = setFields(gate, settings, values);
		if (r.missing.length) return fail(400, { error: `Please answer: ${r.missing.join(', ')}.` });
		complete(event);
	},
	nda: async (event) => {
		const form = await event.request.formData();
		const { link, room, settings, ip } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'nda') return;
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 120);
		if (!name || form.get('accept') !== 'on')
			return fail(400, { error: 'Type your name and tick “I accept” to continue.' });
		if (form.get('version') !== room.current_nda_version_id)
			return fail(409, {
				error: 'The NDA changed while you were reading it. Read the new version and accept again.',
			});
		const session = finishGate(
			gate,
			link,
			room,
			settings,
			{ ip, userAgent: event.request.headers.get('user-agent') },
			name,
		);
		if (!session) error(404, 'unavailable');
		enter(event, link.id, session.token, session.expiresAt);
	},
};
