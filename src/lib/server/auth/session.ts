import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { SESSION_SECRET, ADMIN_PASSWORD } from '$app/env/private';

export const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function sign(payload: string): string {
	if (!SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
	return createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
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
 * Constant-time password check. Both sides go through scrypt to a fixed-length key first, so
 * timingSafeEqual (which needs equal-length inputs) can't leak the candidate's length, and a slow key
 * derivation rather than a plain digest compares them (CodeQL js/insufficient-password-hash). The
 * password is never stored; the admin side is derived once per process with a random salt.
 */
const salt = randomBytes(16);
let adminKey: Buffer | null = null;
const derive = (password: string) => scryptSync(password, salt, 32);

export function checkPassword(candidate: string): boolean {
	if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not set');
	adminKey ??= derive(ADMIN_PASSWORD);
	return timingSafeEqual(derive(candidate), adminKey);
}

/** Throws a 401 unless the request's hooks.server.ts-populated locals mark it as an admin session. */
export function requireAdmin(locals: RequestEvent['locals']) {
	if (!locals.isAdmin) error(401, 'Unauthorized');
}
