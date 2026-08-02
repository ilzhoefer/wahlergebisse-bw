import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';
import { startDateDiscovery } from '$lib/server/date-discovery';

export const POST: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const result = await startDateDiscovery();
	return json(result);
};
