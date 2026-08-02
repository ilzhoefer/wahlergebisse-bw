import { db } from '$lib/server/db';
import { getElectionTypes, getAllElectionDates } from '$lib/server/map/queries';
import { getCities } from '$lib/server/csv-export/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [electionTypes, allDates, cities] = await Promise.all([
		getElectionTypes(db),
		getAllElectionDates(db),
		getCities(db)
	]);

	const descriptionByType = new Map(
		electionTypes.map((t) => [t.electionType, t.electionDescription])
	);

	const elections = allDates
		.filter(
			(d): d is { electionType: number; date: string } => d.electionType !== null && d.date !== null
		)
		.map((d) => {
			const description = descriptionByType.get(d.electionType) ?? 'Unbekannt';
			return {
				electionType: d.electionType,
				date: d.date,
				description,
				label: `${description} ${new Date(d.date).toLocaleDateString('de-DE')}`,
				// Matches the legacy app's conditionalPanel string check for whether the "pro Kandidat:in"
				// toggle is offered — election descriptions containing "Gemeinde" or "Kreis".
				supportsPersonToggle: /Gemeinde|Kreis/.test(description)
			};
		})
		.sort((a, b) => b.date.localeCompare(a.date));

	return { cities, elections };
};
