import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { findMember, touchMember } from '#lib/server/members.ts';
import { startRuntime } from '#lib/server/runtime.ts';
import { building } from '$app/env';

export const init: ServerInit = async () => {
	try {
		await startRuntime();
	} catch (error) {
		console.error('OpenRoom could not start:', error instanceof Error ? error.message : error);
		process.exit(1);
	}
};

const publicAdminRoutes = new Set(['/admin/login', '/admin/invite/[token]']);
const hsts = process.env.ORIGIN?.startsWith('https://');

const securityHeaders: Record<string, string> = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'same-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'cross-origin-opener-policy': 'same-origin',
};

export const handle: Handle = async ({ event, resolve }) => {
	const routeId = event.route.id ?? '';
	const admin = routeId === '/admin' || routeId.startsWith('/admin/');
	event.locals.member = null;
	if (admin) {
		const session = await auth().api.getSession({ headers: event.request.headers });
		const member = session ? findMember(session.user.id) : undefined;
		if (member && member.removed_at === null) {
			event.locals.member = { id: member.id, name: member.name, email: member.email, role: member.role };
			touchMember(member.id);
		}
	}
	const response =
		admin && !event.locals.member && !publicAdminRoutes.has(routeId)
			? new Response(null, {
					status: 303,
					headers: { location: `/admin/login?next=${encodeURIComponent(event.url.pathname)}` },
				})
			: await svelteKitHandler({ auth: auth(), event, resolve, building });
	for (const [name, value] of Object.entries(securityHeaders)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	if (hsts) response.headers.set('strict-transport-security', 'max-age=31536000');
	if (
		admin ||
		routeId === '/mcp' ||
		routeId.startsWith('/api/') ||
		routeId.startsWith('/r/') ||
		routeId.startsWith('/v/') ||
		event.url.pathname.startsWith('/api/')
	)
		response.headers.set('cache-control', 'no-store');
	return response;
};
