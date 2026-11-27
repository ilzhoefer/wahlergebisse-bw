import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getCandidatePage } from '#lib/server/candidatePage.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const candidate = params.name.length <= 200 ? await getCandidatePage(db, params.name) : null;
	if (!candidate) error(404, 'Keine Kandidatur unter diesem Namen gefunden');
	return { candidate };
};
