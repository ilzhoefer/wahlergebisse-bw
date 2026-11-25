import { error, redirect } from '@sveltejs/kit';
import {
	sequence,
	type Handle,
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { ADMIN_PASSWORD, SESSION_SECRET } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { SESSION_COOKIE_NAME, verifySessionToken } from '#lib/server/auth/session.ts';
import { db } from '#lib/server/db/index.ts';
import { crawlRun } from '#lib/server/db/schema.ts';
import { startScheduler } from '#lib/server/scheduler.ts';

// A crawl runs in-process, so any `running` row at startup belongs to a process that died mid-run —
// without this the admin page would show it as live forever.
export const init: ServerInit = async () => {
	if (!dev) {
		// The .env.example placeholders, or anything short enough to brute-force, must not reach production.
		const weak = (v: string | undefined, min: number) => !v || v === 'changeme' || v.length < min;

		if (weak(ADMIN_PASSWORD, 12)) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
		if (weak(SESSION_SECRET, 32))
			throw new Error('SESSION_SECRET must be at least 32 characters (openssl rand -hex 32)');
	}
	await db
		.update(crawlRun)
		.set({ status: 'error', error: 'interrupted', finishedAt: new Date() })
		.where(eq(crawlRun.status, 'running'));
	startScheduler();
};

const handleParaglide: Handle = ({ event, resolve }) =>
	// No `url` strategy, so the middleware never rewrites the request (event.request is read-only in Kit 3).
	paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

/** Sole gate for /admin/*: runs before any load, action or endpoint there, so none of them does work
 * for a logged-out request. Page navigations go to the login, everything else gets a 401. */
const handleAuth: Handle = async ({ event, resolve }) => {
	const isAdmin = verifySessionToken(event.cookies.get(SESSION_COOKIE_NAME));
	event.locals.isAdmin = isAdmin;
	const route = event.route.id ?? '';
	if (!isAdmin && route.startsWith('/admin') && route !== '/admin/login') {
		if (event.request.method === 'GET') redirect(303, '/admin/login');
		error(401, 'Unauthorized');
	}
	const response = await resolve(event);
	// Nothing here is meant to be framed (clickjacking on /admin).
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return response;
};

export const handle: Handle = sequence(handleAuth, handleParaglide);

// The default handler only prints `error.stack`, which is silently "undefined" for thrown non-Error
// values — logging the raw value too makes those cases diagnosable instead of a bare "undefined".
// Kit 3 also passes expected errors (error(...), 404s) here; log only real crashes and keep the
// defaults, which already answer unknown errors with 500 / 'Internal Error'.
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind === 'unknown')
		console.error(`Unhandled error for ${event.request.method} ${event.url.pathname}:`, error);
};
