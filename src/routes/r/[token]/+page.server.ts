import { error, fail, redirect } from '@sveltejs/kit';
import { brandingFor } from '#lib/server/branding.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import { findRoom } from '#lib/server/rooms.ts';
import {
	checkSession,
	effectiveSettings,
	type LinkRow,
	linkByToken,
	sessionCookie,
	visibleTree,
} from '#lib/server/viewer/access.ts';
import { takeRoomPath } from '#lib/server/viewer/context.ts';
import {
	checkCode,
	checkPassword,
	clearEmail,
	codeMinutes,
	finishGate,
	gateCookie,
	gateSteps,
	gateTtlMs,
	loadGate,
	ndaVersion,
	nextStep,
	previousAcceptance,
	resendIn,
	sendCode,
	setEmail,
	setFields,
	sharedBy,
	startGate,
} from '#lib/server/viewer/gates.ts';
import { cookieOptions } from '#lib/server/viewer/http.ts';
import { hit, ipKey, limits } from '#lib/server/viewer/ratelimit.ts';
import { recordedFacts } from '#lib/server/viewer/tracking.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function resolve(event: RequestEvent | Parameters<PageServerLoad>[0], countLookup = true) {
	const ip = event.getClientAddress();
	if (countLookup && !hit(`token:${ipKey(ip)}`, limits.tokenLookup.max, limits.tokenLookup.windowMs))
		error(404, 'unavailable');
	const link = linkByToken(event.params.token);
	const room = link ? findRoom(link.room_id) : undefined;
	if (!link || !room) error(404, 'unavailable');
	return { link, room, settings: effectiveSettings(link, room), ip };
}

function gateFor(event: RequestEvent | Parameters<PageServerLoad>[0], link: LinkRow) {
	const gate = loadGate(link, event.cookies.get(gateCookie(link.id)));
	if (!gate) redirect(303, `${event.url.pathname}?timedout=1`);
	return gate;
}

function complete(event: RequestEvent | Parameters<PageServerLoad>[0]) {
	const { link, room, settings, ip } = resolve(event, false);
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

function enter(
	event: RequestEvent | Parameters<PageServerLoad>[0],
	linkId: string,
	token: string,
	expiresAt: number,
) {
	event.cookies.set(
		sessionCookie(linkId),
		token,
		cookieOptions(event.url, Math.floor((expiresAt - Date.now()) / 1000)),
	);
	event.cookies.delete(gateCookie(linkId), { path: '/' });
	redirect(303, takeRoomPath(event.cookies, event.url, linkId));
}

const gateCookieSeconds = gateTtlMs / 1000 + 86_400;

export const load: PageServerLoad = async (event) => {
	const { link, room, settings, ip } = resolve(event);
	const existing = checkSession(link.id, event.cookies.get(sessionCookie(link.id)));
	if (existing.ok) redirect(303, takeRoomPath(event.cookies, event.url, link.id));
	const cookie = event.cookies.get(gateCookie(link.id));
	let gate = loadGate(link, cookie);
	const timedOut = (!!cookie && !gate) || event.url.searchParams.get('timedout') === '1';
	if (!gate) {
		const token = startGate(link, ip);
		event.cookies.set(gateCookie(link.id), token, cookieOptions(event.url, gateCookieSeconds));
		gate = loadGate(link, token);
	}
	const step = nextStep(link, settings, gate);
	if (step === 'done') complete(event);
	const nda = step === 'nda' ? ndaVersion(room.current_nda_version_id) : null;
	const accepted =
		nda && gate?.verified && gate.viewer_email ? previousAcceptance(gate.viewer_email, room.id) : null;
	const steps = gateSteps(link, settings);
	const extra: {
		steps?: string[];
		stepIndex?: number;
		records?: string[];
		sharedBy?: string | null;
		timedOut?: boolean;
		codeMinutes?: number;
		ndaCopyHref?: string | null;
	} = {
		steps,
		stepIndex: Math.max(0, steps.indexOf(step as (typeof steps)[number])),
		records: recordedFacts(
			settings,
			visibleTree(room.id, link.id).some((node) => node.kind === 'download'),
		),
		sharedBy: sharedBy(),
		timedOut: timedOut && (step === 'email' || step === 'password'),
		codeMinutes,
		ndaCopyHref: nda ? `${event.url.pathname}/nda` : null,
	};
	return {
		step,
		roomName: room.name,
		branding: brandingFor(room),
		email: gate?.viewer_email ?? null,
		resendIn: step === 'code' && gate ? resendIn(gate) : 0,
		fields: settings.customFields,
		ndaHtml: nda ? renderMarkdown(nda.body_markdown) : null,
		ndaDate: nda?.created_at ?? null,
		ndaVersionId: step === 'nda' ? room.current_nda_version_id : null,
		ndaChanged: !!accepted && accepted.nda_version_id !== room.current_nda_version_id,
		...extra,
	};
};

export const actions: Actions = {
	password: async (event) => {
		const form = await event.request.formData();
		const { link } = resolve(event);
		const gate = gateFor(event, link);
		const r = await checkPassword(gate, link, String(form.get('password') ?? ''), event.getClientAddress());
		if (r === 'limited')
			return fail(429, { error: 'Too many tries. Wait 15 minutes and try again.', field: 'password' });
		if (r === 'wrong') return fail(400, { error: 'That password is not right.', field: 'password' });
		complete(event);
	},
	email: async (event) => {
		const form = await event.request.formData();
		const { link, room, settings, ip } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'email') return;
		const r = setEmail(gate, link, settings, String(form.get('email') ?? ''));
		if (r.error === 'invalid') return fail(400, { error: 'Enter a valid email address.', field: 'email' });
		if (r.error === 'not_allowed')
			return fail(403, {
				error:
					"This email doesn't have access to this room. Check the address or ask the person who sent you the link.",
				field: 'email',
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
				return { notice: `We already sent a code to this email; it works for ${codeMinutes} minutes.` };
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
		const form = await event.request.formData();
		const { link, settings } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'code') return;
		const r = checkCode(gate, link, String(form.get('code') ?? ''), event.getClientAddress());
		if (r.result === 'daily')
			return fail(429, { error: 'Too many attempts. Try again tomorrow.', field: 'code' });
		if (r.result === 'expired')
			return fail(400, { error: 'This code has expired. Ask for a new code.', field: 'code' });
		if (r.result === 'used_up')
			return fail(400, { error: 'Too many wrong tries. Ask for a new code.', field: 'code' });
		if (r.result === 'wrong')
			return fail(400, {
				error:
					r.attemptsLeft <= 2
						? `That code is not right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`
						: 'That code is not right.',
				field: 'code',
			});
		complete(event);
	},
	change: async (event) => {
		const { link } = resolve(event);
		clearEmail(gateFor(event, link));
	},
	fields: async (event) => {
		const form = await event.request.formData();
		const { link, settings } = resolve(event);
		const gate = gateFor(event, link);
		if (nextStep(link, settings, gate) !== 'fields') return;
		const values = Object.fromEntries(
			settings.customFields.map((f, i) => [f.label, String(form.get(`field-${i}`) ?? '')]),
		);
		const r = setFields(gate, settings, values);
		if (r.missing.length)
			return fail(400, {
				error: `Please answer: ${r.missing.join(', ')}.`,
				field: `field-${settings.customFields.findIndex((f) => f.label === r.missing[0])}`,
				missing: settings.customFields.flatMap((f, i) => (r.missing.includes(f.label) ? [`field-${i}`] : [])),
			});
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
			return fail(400, {
				error: 'Type your full name and tick “I have read and agree to this NDA” to continue.',
				field: name ? 'accept' : 'name',
			});
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
