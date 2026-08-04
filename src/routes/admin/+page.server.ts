import { desc, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crawlRun, electionType, elections, cities } from '$lib/server/db/schema';
import { maxParallelism } from '$lib/server/crawl-runner';

/**
 * Bürgermeisterwahl (7) and Bürgerentscheid (9) each happen on whatever date one specific municipality
 * scheduled it — not on a shared statewide date like every other election type here. Picking a date
 * first for these would mean choosing from a flat list of hundreds of unrelated per-city dates with no
 * way to tell which belongs to which city, so the admin UI instead has the operator pick the city first,
 * then the date, only for these two.
 */
const CITY_SPECIFIC_TYPES = [7, 9];

export interface CityDates {
	rs: number;
	name: string | null;
	dates: string[];
}

export const load: PageServerLoad = async () => {
	const [lastRun] = await db.select().from(crawlRun).orderBy(desc(crawlRun.id)).limit(1);
	const electionTypes = await db.select().from(electionType).orderBy(electionType.electionType);

	// One row per (date, electionType) already discovered/classified by a previous crawl or a "Termine
	// aktualisieren" run — used to filter the date dropdown down to dates that actually have elections of
	// the selected Wahlart. No live API calls needed — an instant lookup against data already in
	// `elections`.
	const dateTypeRows = await db
		.selectDistinct({ date: elections.date, electionType: elections.electionType })
		.from(elections)
		.orderBy(desc(elections.date));

	const typesToDates: Record<number, string[]> = {};
	for (const row of dateTypeRows) {
		if (row.date === null || row.electionType === null) continue;
		(typesToDates[row.electionType] ??= []).push(row.date);
	}

	// For the two city-specific types, also load which cities have a known election and what dates each
	// of them has — the UI picks a city from this, then a date from that city's own list.
	const cityDateRows = await db
		.select({
			rs: elections.rs,
			date: elections.date,
			electionType: elections.electionType,
			name: cities.name
		})
		.from(elections)
		.innerJoin(cities, eq(cities.rs, elections.rs))
		.where(inArray(elections.electionType, CITY_SPECIFIC_TYPES));

	const cityDatesByType: Record<number, CityDates[]> = {};
	const cityIndexByType = new Map<number, Map<number, number>>();
	for (const row of cityDateRows) {
		if (row.date === null || row.electionType === null) continue;
		const list = (cityDatesByType[row.electionType] ??= []);
		const cityIndex = cityIndexByType.get(row.electionType) ?? new Map<number, number>();
		cityIndexByType.set(row.electionType, cityIndex);
		let i = cityIndex.get(row.rs);
		if (i === undefined) {
			i = list.length;
			cityIndex.set(row.rs, i);
			list.push({ rs: row.rs, name: row.name, dates: [] });
		}
		list[i].dates.push(row.date);
	}
	for (const list of Object.values(cityDatesByType)) {
		list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
		// A city can have more than one `elections` row for the same date (e.g. a runoff/Stichwahl under
		// a different election_id) — dedupe so the date only appears once in the dropdown.
		for (const city of list)
			city.dates = [...new Set(city.dates)].sort((a, b) => b.localeCompare(a));
	}

	return {
		lastRun: lastRun ?? null,
		electionTypes,
		typesToDates,
		citySpecificTypes: CITY_SPECIFIC_TYPES,
		cityDatesByType,
		maxParallel: maxParallelism()
	};
};
