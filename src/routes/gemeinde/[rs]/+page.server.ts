import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getGemeindePage } from '#lib/server/gemeinde.ts';
import { getGemeindeListJumps } from '#lib/server/listJumps.ts';
import { levelOfRs } from '#lib/map/shareUrl.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rs = Number(params.rs);
	if (!Number.isSafeInteger(rs) || levelOfRs(rs) !== 'Gemeinde')
		error(404, 'Gemeinde nicht gefunden');
	const [gemeinde, listJumps] = await Promise.all([
		getGemeindePage(db, rs),
		getGemeindeListJumps(db, rs)
	]);
	if (!gemeinde) error(404, 'Gemeinde nicht gefunden');
	return { gemeinde, listJumps };
};
