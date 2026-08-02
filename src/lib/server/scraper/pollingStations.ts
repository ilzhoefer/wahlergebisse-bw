import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, pollingStations } from '$lib/server/db/schema';
import {
	BASE,
	padAgs,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnContentNull,
	fallbackOnNotOk,
	progressEvery,
	type Logger
} from './client';

type Db = typeof DbType;

interface UebersichtResponse {
	tabelle: {
		zeilen: {
			label: string;
			statusString: string;
			link: { id: string };
		}[];
	};
}

interface WahlraumResponse {
	strasse_hnr?: string;
	plz_ort?: string;
	barrierefrei?: string;
}

/** Port of get_polling_station_election_city. */
export async function getPollingStationElectionCity(
	db: Db,
	params: { electionId: number; ags: number; rs: number; date: string; skipProcessed: boolean },
	log: Logger
) {
	const { electionId, ags, rs, date, skipProcessed } = params;
	const dateStr = formatDateForUrl(date);
	const agsStr = padAgs(ags);

	const { content } = await fetchWithFallback<UebersichtResponse>(
		`${BASE}/wahltermin-${dateStr}/${agsStr}/daten/api/wahl_${electionId}/uebersicht_ebene_6_0.json`,
		`${BASE}/wahltermin-${dateStr}/${agsStr}/api/praesentation/wahl_${electionId}/uebersicht_ebene_6_0.json`,
		fallbackOnContentNull
	);
	const wahlbezirke = content?.tabelle?.zeilen;
	if (!wahlbezirke) {
		log(`Fehler beim Abrufen der Wahlbezirke für rs=${rs}`);
		return;
	}

	if (skipProcessed) {
		const existing = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(pollingStations)
			.where(
				and(
					eq(pollingStations.rs, rs),
					eq(pollingStations.date, date),
					eq(pollingStations.electionId, electionId)
				)
			);
		if ((existing[0]?.count ?? 0) === wahlbezirke.length) {
			log(`rs=${rs}: alle Wahlbezirke bereits aktuell, überspringe`);
			return;
		}
	}

	const tickEvery = progressEvery(wahlbezirke.length);
	for (const [i, wahlbezirk] of wahlbezirke.entries()) {
		// Same rationale as the periodic log in results.ts: a large city's polling-station overview can
		// have hundreds of entries, each needing its own metadata request. The progress tick is throttled
		// separately (and more finely) than the text log line so the bar still feels live without
		// flooding the SSE stream or the persisted log.
		if (i > 0 && i % 25 === 0) {
			log(`rs=${rs}: Wahlbezirk ${i}/${wahlbezirke.length} verarbeitet`);
		}
		if (i % tickEvery === 0 || i === wahlbezirke.length - 1) {
			log('', {
				level: 'station',
				index: i + 1,
				total: wahlbezirke.length,
				label: `Wahlbezirk ${i + 1}/${wahlbezirke.length}`
			});
		}
		const match = /[^_]+$/.exec(wahlbezirk.link.id);
		const psId = match ? Number(match[0]) : NaN;
		if (!Number.isFinite(psId)) continue;

		if (wahlbezirk.statusString !== 'eingegangen') {
			log(`Wahlbezirk ${psId}: Status "${wahlbezirk.statusString}", noch nicht verfügbar`);
			continue;
		}

		const { status, content: meta } = await fetchWithFallback<WahlraumResponse>(
			`${BASE}/wahltermin-${dateStr}/${agsStr}/daten/api/wahlraum_${psId}.json`,
			`${BASE}/wahltermin-${dateStr}/${agsStr}/api/praesentation/wahlraum_${psId}.json`,
			fallbackOnNotOk
		);

		const isPostal = status !== 200;
		const address = isPostal ? null : `${meta?.strasse_hnr ?? ''} ${meta?.plz_ort ?? ''}`.trim();
		const description = isPostal ? null : (meta?.barrierefrei ?? null);

		await db
			.insert(pollingStations)
			.values({
				rs,
				psId,
				name: wahlbezirk.label,
				address,
				description,
				date,
				isPostal,
				electionId
			})
			.onConflictDoNothing();
	}
}

/**
 * Port of get_polling_stations_election. `date` is an ISO string here (the R original parses a
 * German-formatted date string; the admin form always supplies ISO, so no parsing is needed).
 */
export async function getPollingStationsElection(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	electionTypeId: number,
	date: string,
	skipProcessed: boolean,
	log: Logger
) {
	for (const [i, city] of cityList.entries()) {
		const cityLabel = city.name ?? String(city.rs);
		log(`[${i + 1}/${cityList.length}] ${cityLabel}: Wahlbezirke abrufen`, {
			level: 'city',
			index: i + 1,
			total: cityList.length,
			label: cityLabel
		});

		const [relevantElection] = await db
			.select({ electionId: elections.electionId })
			.from(elections)
			.where(
				and(
					eq(elections.rs, city.rs),
					eq(elections.date, date),
					eq(elections.electionType, electionTypeId)
				)
			);

		if (!relevantElection) {
			log(`${city.name ?? city.rs}: keine passende Wahl gefunden, überspringe`);
			continue;
		}

		await getPollingStationElectionCity(
			db,
			{ electionId: relevantElection.electionId, ags: city.ags, rs: city.rs, date, skipProcessed },
			log
		);
	}

	// Belt-and-suspenders: any station with "Brief" in its name is postal, regardless of what the
	// per-station metadata call determined.
	await db.execute(
		sql`UPDATE ${pollingStations} SET is_postal = TRUE WHERE name LIKE '%Brief%' AND is_postal = FALSE`
	);
}
