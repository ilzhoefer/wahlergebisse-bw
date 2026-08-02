import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** Sole enforcement point for /admin/* — /admin/login itself must stay reachable while logged out. */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.isAdmin && url.pathname !== '/admin/login') {
		redirect(303, '/admin/login');
	}
};
