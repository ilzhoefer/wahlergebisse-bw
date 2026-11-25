import { sequence } from '@sveltejs/kit/hooks';
import {
	error,
	redirect,
	type Handle,
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '$lib/server/auth/session';
import { db } from '$lib/server/db';
import { crawlRun } from '$lib/server/db/schema';
import { startScheduler } from '$lib/server/scheduler';

// A crawl runs in-process, so any `running` row at startup belongs to a process that died mid-run —
// without this the admin page would show it as live forever.
export const init: ServerInit = async () => {
	if (!dev) {
		// The .env.example placeholders, or anything short enough to brute-force, must not reach production.
		const weak = (v: string | undefined, min: number) => !v || v === 'changeme' || v.length < min;
		if (weak(env.ADMIN_PASSWORD, 12))
			throw new Error('ADMIN_PASSWORD must be at least 12 characters');
		if (weak(env.SESSION_SECRET, 32))
			throw new Error('SESSION_SECRET must be at least 32 characters (openssl rand -hex 32)');
	}
	await db
		.update(crawlRun)
		.set({ status: 'error', error: 'interrupted', finishedAt: new Date() })
		.where(eq(crawlRun.status, 'running'));
	startScheduler();
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

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
export const handleError: HandleServerError = ({ error, event }) => {
	console.error(`Unhandled error for ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Internal Error' };
};
