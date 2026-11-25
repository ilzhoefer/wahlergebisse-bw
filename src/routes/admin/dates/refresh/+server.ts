import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/session.ts';
import { startDateDiscovery } from '#lib/server/date-discovery/index.ts';

export const POST: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const result = await startDateDiscovery();
	return Response.json(result);
};
