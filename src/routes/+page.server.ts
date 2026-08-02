import { db } from '$lib/server/db';
import { getElectionTypes, getAllElectionDates, possibleMapModes } from '$lib/server/map/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
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

	return {
		electionTypes: electionTypes.filter(
			(t): t is { electionType: number; electionDescription: string } =>
				t.electionType !== null && t.electionDescription !== null
		),
		datesByType: Object.fromEntries(datesByType),
		mapModesByType: Object.fromEntries(
			electionTypes
				.filter((t) => t.electionType !== null)
				.map((t) => [t.electionType as number, possibleMapModes(t.electionType as number)])
		)
	};
};
