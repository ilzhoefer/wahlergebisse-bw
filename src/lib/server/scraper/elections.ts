import { sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionsVotetypes, electionType } from '$lib/server/db/schema';
import {
	BASE,
	padAgs,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnNotOk,
	type Logger
} from './client';

type Db = typeof DbType;

interface TermineResponse {
	termine: { date: string }[];
}

interface TerminResponse {
	wahleintraege: {
		wahl: { id: number; titel: string };
		stimmentyp: { id: number; titel: string };
		gebiet_link?: { id: string };
	}[];
}

/** Parses a German dd.mm.yyyy date string to an ISO yyyy-mm-dd string. */
function parseGermanDate(value: string): string {
	const [day, month, year] = value.split('.');
	return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Port of get_election_dates. No fallback URL in the original — kept as-is. */
export async function getElectionDates(ags: number): Promise<string[]> {
	try {
		const res = await fetch(`${BASE}/${padAgs(ags)}/api/termine.json`);
		if (!res.ok) return [];
		const data = (await res.json()) as TermineResponse;
		return (data.termine ?? []).map((t) => parseGermanDate(t.date));
	} catch {
		// Network hiccups shouldn't take down a ~1100-city crawl — skip this city's dates, move on.
		return [];
	}
}

export interface ElectionIdRow {
	electionId: number;
	title: string;
	votetypeId: number;
	votetypeDescription: string;
	resultId: string | null;
}

/** Port of get_election_ids. */
export async function getElectionIds(
	ags: number,
	isoDate: string
): Promise<ElectionIdRow[] | null> {
	const dateStr = formatDateForUrl(isoDate);
	const agsStr = padAgs(ags);
	const { content } = await fetchWithFallback<TerminResponse>(
		`${BASE}/wahltermin-${dateStr}/${agsStr}/daten/api/termin.json`,
		`${BASE}/wahltermin-${dateStr}/${agsStr}/api/praesentation/termin.json`,
		fallbackOnNotOk
	);
	if (!content) return null;
	return content.wahleintraege.map((w) => ({
		electionId: w.wahl.id,
		title: w.wahl.titel,
		votetypeId: w.stimmentyp.id,
		votetypeDescription: w.stimmentyp.titel,
		resultId: w.gebiet_link?.id ?? null
	}));
}

/**
 * Port of update_election_dates. Discovers election dates + IDs for every city and inserts into
 * `elections`/`elections_votetypes`. NOTE: unlike the R original (which drops `result_id` from the
 * `elections` insert entirely, even though it fetches it), this port includes it — see the Phase 3
 * plan's "findings" section: `get_elected_members` needs it and the omission looks like an oversight,
 * not an intentional behavior.
 */
export async function updateElectionDates(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	log: Logger,
	onlyDate?: string
) {
	for (const [i, city] of cityList.entries()) {
		const cityLabel = city.name ?? String(city.rs);
		log(`[${i + 1}/${cityList.length}] ${cityLabel}: Wahltermine abrufen`, {
			level: 'city',
			index: i + 1,
			total: cityList.length,
			label: cityLabel,
			rs: city.rs,
			cityStatus: 'in_progress'
		});
		let dates = await getElectionDates(city.ags);
		if (onlyDate) dates = dates.filter((d) => d === onlyDate);

		for (const date of dates) {
			const rows = await getElectionIds(city.ags, date);
			if (!rows || rows.length === 0) continue;

			const byElectionId = new Map<number, ElectionIdRow>();
			for (const row of rows) byElectionId.set(row.electionId, row);

			for (const row of byElectionId.values()) {
				await db
					.insert(elections)
					.values({
						electionId: row.electionId,
						electionName: row.title,
						rs: city.rs,
						date,
						resultId: row.resultId
					})
					.onConflictDoNothing();
			}
			for (const row of rows) {
				await db
					.insert(electionsVotetypes)
					.values({
						rs: city.rs,
						electionId: row.electionId,
						votetypeId: row.votetypeId,
						votetypeDescription: row.votetypeDescription
					})
					.onConflictDoNothing();
			}
		}
	}
}

/** Port of update_election_type — one UPDATE per (type, pattern) pair, only touching still-NULL rows. */
async function updateElectionTypeByPattern(db: Db, type: number, pattern: string) {
	await db.execute(
		sql`UPDATE ${elections} SET election_type = ${type} WHERE election_name LIKE ${'%' + pattern + '%'} AND election_type IS NULL`
	);
}

/**
 * Port of set_election_type. The cascade's exact ordering and cumulative "only touch still-unclassified
 * rows" behavior is load-bearing — see the Phase 3 plan's findings. Type IDs are looked up by
 * description at runtime, exactly like the R original — never hardcoded.
 */
export async function setElectionType(db: Db, log: Logger) {
	const types = await db.select().from(electionType);

	for (const t of types) {
		if (t.electionDescription === null) continue;
		let pattern = t.electionDescription;
		log(`Wahlart-Muster "${pattern}" (Typ ${t.electionType}) anwenden`);
		await updateElectionTypeByPattern(db, t.electionType, pattern);

		pattern = pattern.replaceAll('swahl', '').replaceAll('wahl', '');
		await updateElectionTypeByPattern(db, t.electionType, pattern);

		pattern = pattern.replaceAll('srat', '');
		await updateElectionTypeByPattern(db, t.electionType, pattern);
	}

	const typeIdFor = (description: string) =>
		types.find((t) => t.electionDescription === description)?.electionType;

	const overrides: [pattern: string, description: string][] = [
		['RV Stuttgart', 'Regionalwahl'],
		['Stadtratswahl', 'Gemeinderatswahl'],
		['Kommunalwahl', 'Gemeinderatswahl'],
		['Oberbürgermeister', 'Bürgermeisterwahl'],
		['OB', 'Bürgermeisterwahl'],
		['BM', 'Bürgermeisterwahl'],
		['Kreisräte', 'Kreistagswahl'],
		['OR', 'Ortschaftsratswahl'],
		['Gemeind', 'Gemeinderatswahl'],
		['GR', 'Gemeinderatswahl'],
		['Orts', 'Ortschaftsratswahl'],
		['Neuwahl', 'Gemeinderatswahl'],
		['Stichwahl', 'Gemeinderatswahl']
	];
	for (const [pattern, description] of overrides) {
		const type = typeIdFor(description);
		if (type !== undefined) await updateElectionTypeByPattern(db, type, pattern);
	}

	// Ganz am Ende den Rest auf "Andere" setzen — equivalent to the R original's `LIKE '%%%'` catch-all
	// (also matches everything), written directly instead of replicating the LIKE-hack literally.
	const other = typeIdFor('Andere');
	if (other !== undefined) {
		await db.execute(
			sql`UPDATE ${elections} SET election_type = ${other} WHERE election_type IS NULL`
		);
	}
	log('Wahlarten zugeordnet');
}
