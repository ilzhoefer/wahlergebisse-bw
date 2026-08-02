import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function sign(payload: string): string {
	if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
	return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('hex');
}

/** A stateless signed cookie value: `<expiryMs>.<hmac>` — no session store, nothing to lose on restart. */
export function createSessionToken(): string {
	const expiry = String(Date.now() + SESSION_DURATION_MS);
	return `${expiry}.${sign(expiry)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
	if (!token) return false;
	const [expiry, signature] = token.split('.');
	if (!expiry || !signature) return false;

	const expected = Buffer.from(sign(expiry), 'hex');
	const actual = Buffer.from(signature, 'hex');
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

	return Number.isFinite(Number(expiry)) && Date.now() <= Number(expiry);
}

/**
 * Constant-time password check. Hashing both sides to a fixed-length digest first (rather than
 * comparing the raw strings) avoids leaking the candidate's length via an early bail-out before
 * timingSafeEqual — which requires equal-length inputs to run at all.
 */
export function checkPassword(candidate: string): boolean {
	if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not set');
	const a = createHash('sha256').update(candidate).digest();
	const b = createHash('sha256').update(env.ADMIN_PASSWORD).digest();
	return timingSafeEqual(a, b);
}

/** Throws a 401 unless the request's hooks.server.ts-populated locals mark it as an admin session. */
export function requireAdmin(locals: RequestEvent['locals']) {
	if (!locals.isAdmin) error(401, 'Unauthorized');
}
