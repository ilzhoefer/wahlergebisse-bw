import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	redirect(303, '/admin/login');
};
