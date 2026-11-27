import { fail, redirect } from '@sveltejs/kit';
import {
	checkPassword,
	createSessionToken,
	SESSION_COOKIE_NAME
} from '#lib/server/auth/session.ts';
import type { Actions, PageServerLoad } from './$types';

// Failed attempts per client IP. Behind a reverse proxy set adapter-node's ADDRESS_HEADER (e.g.
// X-Forwarded-For), or every visitor shares the proxy's IP and one attacker locks out the admin too.
// ponytail: per-process, resets on restart; fine for a single instance.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

export const load: PageServerLoad = ({ locals }) => {
	if (locals.isAdmin) redirect(303, '/admin');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		const now = Date.now();
		for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
		const entry = failures.get(ip);
		if (entry && entry.count >= MAX_FAILURES) return fail(429, { error: 'too_many_attempts' });

		const form = await request.formData();
		const password = form.get('password')?.toString() ?? '';

		if (!checkPassword(password)) {
			if (entry) entry.count += 1;
			else failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
			return fail(401, { error: 'wrong_password' });
		}
		failures.delete(ip);

		cookies.set(SESSION_COOKIE_NAME, createSessionToken(), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});

		redirect(303, '/admin');
	}
};
