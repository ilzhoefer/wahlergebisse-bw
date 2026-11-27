import { db } from '#lib/server/db/index.ts';
import { getElectionTypes, getAllElectionDates } from '#lib/server/map/queries.ts';
import { mapShareMeta } from '#lib/server/map/shareMeta.ts';
import { readShareParams } from '#lib/map/shareUrl.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const [electionTypes, allDates] = await Promise.all([
		getElectionTypes(db),
		getAllElectionDates(db)
	]);

	const datesByType = new Map<number, string[]>();
	for (const row of allDates) {
		if (row.electionType === null || row.date === null) continue;
		const list = datesByType.get(row.electionType) ?? [];
		list.push(row.date);
		datesByType.set(row.electionType, list);
	}

	const types = electionTypes.filter(
		(t): t is { electionType: number; electionDescription: string } =>
			t.electionType !== null && t.electionDescription !== null
	);
	const byType = Object.fromEntries(datesByType);
	return {
		electionTypes: types,
		datesByType: byType,
		meta: await mapShareMeta(db, readShareParams(url.searchParams), types, byType)
	};
};
