import type { db as DbType } from '$lib/server/db';
import { cities } from '$lib/server/db/schema';
import type { Logger } from './client';
import { updateElectionDates, setElectionType } from './elections';
import { getPollingStationsElection } from './pollingStations';
import { getResultsCity } from './results';
import { updatePartyFamily } from './partyFamily';
import { updateAggregateParty } from './aggregates';
import { updateMappingStuttgart, type StuttgartDistrictRow } from './stuttgartMapping';
import { importVoteDistrictMapping, type VoteDistrictRow } from './voteDistricts';
import { getElectedMembers } from './electedMembers';
import { importKreisOpenData } from './kreisOpenData';

import districts20210926 from './stuttgart-districts/2021-09-26.json';
import districts20240609 from './stuttgart-districts/2024-06-09.json';
import districts20250223 from './stuttgart-districts/2025-02-23.json';

import voteDistricts20160313 from './vote-districts/2016-03-13.json';
import voteDistricts20210314 from './vote-districts/2021-03-14.json';
import voteDistricts20210926 from './vote-districts/2021-09-26.json';
import voteDistricts20250223 from './vote-districts/2025-02-23.json';

type Db = typeof DbType;

const STUTTGART_DISTRICTS: Record<string, StuttgartDistrictRow[]> = {
	'2021-09-26': districts20210926 as StuttgartDistrictRow[],
	'2024-06-09': districts20240609 as StuttgartDistrictRow[],
	'2025-02-23': districts20250223 as StuttgartDistrictRow[]
};

// Every non-Stuttgart municipality's Gemeinde -> Wahlkreis assignment (see
// `scripts/prepare-vote-districts.ts`) — Landtagswahl reuses the 2021 assignment for 2016 too, since
// BW's Landtags-Wahlkreise haven't been redrawn since 1996.
const VOTE_DISTRICT_DATA: Record<string, VoteDistrictRow[]> = {
	'2016-03-13': voteDistricts20160313 as VoteDistrictRow[],
	'2021-03-14': voteDistricts20210314 as VoteDistrictRow[],
	'2021-09-26': voteDistricts20210926 as VoteDistrictRow[],
	'2025-02-23': voteDistricts20250223 as VoteDistrictRow[]
};

export interface CrawlParams {
	date: string;
	electionTypeId: number;
}

/**
 * Port of the `new_data_calls.R` sequence — later steps depend on tables populated by earlier ones
 * (aggregates depend on party-family mapping, etc.), so the order here must not change. `skipProcessed`
 * and `override` are fixed to match the reference script's actual calls (`TRUE` for both everywhere
 * they're used) rather than exposed as admin-configurable toggles, since nothing in the source ever
 * varied them.
 */
// Fixed step count for progress reporting — the Stuttgart-mapping and Wahlkreis-import steps always
// run (as a no-op log line when there's no data for the date/type), so the total is constant
// regardless of branch.
const TOTAL_STEPS = 10;

/**
 * Re-derives everything that depends on the party-family mapping for an already-crawled election —
 * the mapping itself, the region/district aggregates and Stuttgart's polling-station aggregates —
 * without re-fetching anything. Run after changing the families (party-families.csv) or the
 * matching rules in partyFamily.ts; see scripts/remap-parties.ts. (Seat counts need nothing: they're
 * resolved through the mapping at query time.)
 */
export async function remapPartyFamilies(db: Db, params: CrawlParams, log: Logger) {
	await updatePartyFamily(db, params.date, params.electionTypeId, true, log);
	await updateAggregateParty(db, params.date, params.electionTypeId, true, log);
	const districtRows = STUTTGART_DISTRICTS[params.date];
	if (districtRows)
		await updateMappingStuttgart(db, districtRows, params.date, params.electionTypeId, log);
}

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

	stepTick('Wahltermine aktualisieren');
	await updateElectionDates(db, cityList, log, params.date);

	stepTick('Wahlarten zuordnen');
	await setElectionType(db, log);

	stepTick('Wahlbezirke abrufen');
	await getPollingStationsElection(db, cityList, params.electionTypeId, params.date, true, log);

	stepTick('Ergebnisse abrufen');
	await getResultsCity(db, cityList, params.date, params.electionTypeId, true, log);

	stepTick('Fehlende Gemeinden aus Kreis-Open-Data ergänzen');
	// After the per-city steps, which would otherwise look these Gemeinden up on komm.one in vain.
	await importKreisOpenData(db, cityList, params.date, log);
	await setElectionType(db, log);

	stepTick('Parteifamilien zuordnen');
	await updatePartyFamily(db, params.date, params.electionTypeId, true, log);

	stepTick('Wahlkreis-Gemeinden-Zuordnung importieren');
	// Must run before `updateAggregateParty` (which computes the Wahlkreis-grain aggregates from
	// `election_vote_district_mapping` for Bundestags-/Landtagswahlen) — every other election type has
	// no Wahlkreis concept at all.
	if (params.electionTypeId === 2 || params.electionTypeId === 3) {
		await importVoteDistrictMapping(
			db,
			VOTE_DISTRICT_DATA[params.date] ?? [],
			params.date,
			params.electionTypeId,
			log
		);
	} else {
		log('Kein Wahlkreis-Konzept für diese Wahlart, überspringe Zuordnung');
	}

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
	await getElectedMembers(db, cityList, params.date, params.electionTypeId, log);

	log('Crawl abgeschlossen');
}
