import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';
import { startCrawl } from '$lib/server/crawl-runner';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);

	const body = await request.json();
	const date = typeof body.date === 'string' ? body.date : '';
	const electionTypeId = Number(body.electionTypeId);

	if (!date || !Number.isFinite(electionTypeId)) {
		return json({ started: false, reason: 'missing_fields' }, { status: 400 });
	}

	const result = await startCrawl({ date, electionTypeId });
	return json(result);
};
