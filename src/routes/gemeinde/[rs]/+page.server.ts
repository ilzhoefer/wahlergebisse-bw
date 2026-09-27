import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getGemeindePage } from '$lib/server/gemeinde';
import { levelOfRs } from '$lib/map/shareUrl';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rs = Number(params.rs);
	if (!Number.isSafeInteger(rs) || levelOfRs(rs) !== 'Gemeinde')
		error(404, 'Gemeinde nicht gefunden');
	const gemeinde = await getGemeindePage(db, rs);
	if (!gemeinde) error(404, 'Gemeinde nicht gefunden');
	return { gemeinde };
};
