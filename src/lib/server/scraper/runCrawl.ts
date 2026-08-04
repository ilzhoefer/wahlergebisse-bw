import type { db as DbType } from '$lib/server/db';
import { cities } from '$lib/server/db/schema';
import { DEFAULT_PARALLEL, type Logger } from './client';
import { updateElectionDates, setElectionType } from './elections';
import { getPollingStationsElection } from './pollingStations';
import { getResultsCity } from './results';
import { updatePartyFamily } from './partyFamily';
import { updateAggregateParty } from './aggregates';
import { updateMappingStuttgart, type StuttgartDistrictRow } from './stuttgartMapping';
import { getElectedMembers } from './electedMembers';

import districts20210926 from './stuttgart-districts/2021-09-26.json';
import districts20240609 from './stuttgart-districts/2024-06-09.json';
import districts20250223 from './stuttgart-districts/2025-02-23.json';

type Db = typeof DbType;

const STUTTGART_DISTRICTS: Record<string, StuttgartDistrictRow[]> = {
	'2021-09-26': districts20210926 as StuttgartDistrictRow[],
	'2024-06-09': districts20240609 as StuttgartDistrictRow[],
	'2025-02-23': districts20250223 as StuttgartDistrictRow[]
};

export interface CrawlParams {
	date: string;
	electionTypeId: number;
	/** How many cities the per-city steps process concurrently — see `maxParallelism` for the cap. */
	parallel?: number;
}

/**
 * Port of the `new_data_calls.R` sequence — later steps depend on tables populated by earlier ones
 * (aggregates depend on party-family mapping, etc.), so the order here must not change. `skipProcessed`
 * and `override` are fixed to match the reference script's actual calls (`TRUE` for both everywhere
 * they're used) rather than exposed as admin-configurable toggles, since nothing in the source ever
 * varied them.
 */
// Fixed step count for progress reporting — the Stuttgart-mapping step always runs (as a no-op log
// line when there's no district data for the date), so the total is constant regardless of branch.
const TOTAL_STEPS = 8;

export async function runCrawl(db: Db, params: CrawlParams, log: Logger) {
	let step = 0;
	const stepTick = (label: string) => {
		step += 1;
		log(label, { level: 'step', index: step, total: TOTAL_STEPS, label });
	};

	// A city without an `ags` can't be looked up against the komm.one API at all — skip it defensively
	// rather than crashing the whole crawl (every real, populated city has one).
	const cityList = (await db.select().from(cities)).flatMap((c) =>
		c.ags === null ? [] : [{ rs: c.rs, ags: c.ags, name: c.name }]
	);

	const parallel = params.parallel ?? DEFAULT_PARALLEL;

	stepTick('Wahltermine aktualisieren');
	await updateElectionDates(db, cityList, log, params.date, parallel);

	stepTick('Wahlarten zuordnen');
	await setElectionType(db, log);

	stepTick('Wahlbezirke abrufen');
	await getPollingStationsElection(
		db,
		cityList,
		params.electionTypeId,
		params.date,
		true,
		log,
		parallel
	);

	stepTick('Ergebnisse abrufen');
	await getResultsCity(db, cityList, params.date, params.electionTypeId, true, log, parallel);

	stepTick('Parteifamilien zuordnen');
	await updatePartyFamily(db, params.date, params.electionTypeId, true, log);

	stepTick('Aggregate berechnen');
	await updateAggregateParty(db, params.date, params.electionTypeId, true, log);

	stepTick('Stuttgart-Wahlkreiszuordnung aktualisieren');
	// The ps-level postal/in-person mapping and its meta/party aggregates (what the Wahlbezirk map
	// reads) apply to every election type sharing this date — only the Bundestag/Landtag *district*
	// numbers inside updateMappingStuttgart are type-specific, and that's already handled there.
	{
		const districtRows = STUTTGART_DISTRICTS[params.date];
		if (districtRows) {
			await updateMappingStuttgart(db, districtRows, params.date, params.electionTypeId, log);
		} else {
			log(
				`Keine Stuttgart-Bezirksdaten für ${params.date} vorhanden, überspringe Wahlkreiszuordnung`
			);
		}
	}

	stepTick('Gewählte Mitglieder abrufen');
	await getElectedMembers(db, cityList, params.date, params.electionTypeId, log, parallel);

	log('Crawl abgeschlossen');
}
