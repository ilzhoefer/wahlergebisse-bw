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

export interface DateOption {
	date: string;
	cityCount: number;
	/** Only populated when `cityCount` is small enough to name individually (see
	 * SMALL_DATE_CITY_THRESHOLD) — flags a one-off/repeat election (e.g. a court-ordered Wiederholungswahl
	 * for a single municipality) instead of presenting it like an ordinary statewide date. */
	cityNames: string[];
}

/**
 * Below this many distinct municipalities, a date is treated as a one-off worth naming rather than an
 * ordinary statewide election date — every genuinely statewide date here has hundreds of cities, so this
 * comfortably separates the two without needing to hardcode specific dates.
 */
const SMALL_DATE_CITY_THRESHOLD = 5;

export const load: PageServerLoad = async () => {
	const [lastRun] = await db.select().from(crawlRun).orderBy(desc(crawlRun.id)).limit(1);
	const electionTypes = await db.select().from(electionType).orderBy(electionType.electionType);

	// One row per (date, electionType, city) already discovered/classified by a previous crawl or a
	// "Termine aktualisieren" run — used to filter the date dropdown down to dates that actually have
	// elections of the selected Wahlart, and to flag dates that only cover a handful of municipalities
	// (see SMALL_DATE_CITY_THRESHOLD) rather than the usual statewide vote. No live API calls needed — an
	// instant lookup against data already in `elections`. `selectDistinct` on all four columns avoids
	// double-counting a city whose Ortschaftsratswahl, say, has one `elections` row per Ortschaft.
	const dateTypeCityRows = await db
		.selectDistinct({
			date: elections.date,
			electionType: elections.electionType,
			rs: elections.rs,
			name: cities.name
		})
		.from(elections)
		.innerJoin(cities, eq(cities.rs, elections.rs));

	const typesToDates: Record<number, DateOption[]> = {};
	const dateIndexByType = new Map<number, Map<string, number>>();
	for (const row of dateTypeCityRows) {
		if (row.date === null || row.electionType === null) continue;
		const list = (typesToDates[row.electionType] ??= []);
		const dateIndex = dateIndexByType.get(row.electionType) ?? new Map<string, number>();
		dateIndexByType.set(row.electionType, dateIndex);
		let i = dateIndex.get(row.date);
		if (i === undefined) {
			i = list.length;
			dateIndex.set(row.date, i);
			list.push({ date: row.date, cityCount: 0, cityNames: [] });
		}
		list[i].cityCount += 1;
		list[i].cityNames.push(row.name ?? String(row.rs));
	}
	for (const list of Object.values(typesToDates)) {
		list.sort((a, b) => b.date.localeCompare(a.date));
		for (const d of list) {
			if (d.cityCount > SMALL_DATE_CITY_THRESHOLD) d.cityNames = [];
			else d.cityNames.sort((a, b) => a.localeCompare(b));
		}
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
