import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, createSessionToken, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.isAdmin) redirect(303, '/admin');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const password = form.get('password')?.toString() ?? '';

		if (!checkPassword(password)) {
			return fail(401, { error: 'wrong_password' });
		}

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
