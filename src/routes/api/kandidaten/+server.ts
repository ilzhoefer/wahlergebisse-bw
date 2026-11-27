import { db } from '#lib/server/db/index.ts';
import { searchPeople } from '#lib/server/candidatePage.ts';
import type { RequestHandler } from './$types';

/** Name search for the candidate pages' search box: `?q=` (at least 3 characters). */
export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	return Response.json(q.length < 3 ? [] : await searchPeople(db, q));
};
