import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '$lib/server/auth/session';

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

const handleAuth: Handle = ({ event, resolve }) => {
	event.locals.isAdmin = verifySessionToken(event.cookies.get(SESSION_COOKIE_NAME));
	return resolve(event);
};

export const handle: Handle = sequence(handleAuth, handleParaglide);

// The default handler only prints `error.stack`, which is silently "undefined" for thrown non-Error
// values — logging the raw value too makes those cases diagnosable instead of a bare "undefined".
export const handleError: HandleServerError = ({ error, event }) => {
	console.error(`Unhandled error for ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Internal Error' };
};
