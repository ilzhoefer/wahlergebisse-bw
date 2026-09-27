import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getStatewideListJumps } from '$lib/server/listJumps';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const stats = await getStatewideListJumps(db, url.searchParams.get('datum'));
	if (!stats) error(404, 'Noch keine Gemeinderatswahl mit gewählten Mitgliedern');
	return { stats };
};
