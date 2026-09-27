import type { db as DbType } from '$lib/server/db';
import { cities } from '$lib/server/db/schema';
import { DEFAULT_PARALLEL, type Logger } from './client';
import { updateElectionDates, setElectionType } from './elections';
import { getPollingStationsElection } from './pollingStations';
import { getResultsCity, neutralizeCentralCountPlaceholders } from './results';
import { updatePartyFamily } from './partyFamily';
import { updateAggregateParty } from './aggregates';
import { updateMappingStuttgart, type StuttgartDistrictRow } from './stuttgartMapping';
import { importVoteDistrictMapping, type VoteDistrictRow } from './voteDistricts';
import { getElectedMembers } from './electedMembers';
import { importKreisOpenData } from './kreisOpenData';
import { importHtml5OpenData, mapJsonStationsToWahlkreise } from './html5OpenData';
import { resetElectionData } from './resetElectionData';
import { hasStatistikBwSource, importStatistikBw } from './statistikBw';
import { updateWahlbezirkAggregates, type PostalCatchments } from './wahlbezirkAggregates';

import districts20190526 from './stuttgart-districts/2019-05-26.json';
import districts20210926 from './stuttgart-districts/2021-09-26.json';
import districts20240609 from './stuttgart-districts/2024-06-09.json';
import districts20250223 from './stuttgart-districts/2025-02-23.json';

import voteDistricts20160313 from './vote-districts/2016-03-13.json';
import voteDistricts20210314 from './vote-districts/2021-03-14.json';
import voteDistricts20210926 from './vote-districts/2021-09-26.json';
import voteDistricts20250223 from './vote-districts/2025-02-23.json';

import postal20260308 from './wahlbezirk-postal/2026-03-08.json';

type Db = typeof DbType;

const STUTTGART_DISTRICTS: Record<string, StuttgartDistrictRow[]> = {
	'2019-05-26': districts20190526 as StuttgartDistrictRow[],
	'2021-09-26': districts20210926 as StuttgartDistrictRow[],
	'2024-06-09': districts20240609 as StuttgartDistrictRow[],
	'2025-02-23': districts20250223 as StuttgartDistrictRow[],
	// Same Wahlbezirke as those dates (see STUTTGART_BEZIRKE_SAME_AS). The Landtag Wahlkreis of each
	// Bezirk comes from the html5 import instead (LWKNUM_T is empty there).
	'2021-03-14': districts20210926 as StuttgartDistrictRow[],
	'2016-03-13': districts20190526 as StuttgartDistrictRow[]
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

// Cities with Wahlbezirk polygons whose Briefwahlbezirke are spread over their Urnenwahlbezirke (see
// scripts/prepare-wahlbezirke.ts) — from 2026 on, instead of STUTTGART_DISTRICTS.
const WAHLBEZIRK_POSTAL: Record<string, PostalCatchments> = {
	'2026-03-08': postal20260308
};

export interface CrawlParams {
	date: string;
	electionTypeId: number;
	/** How many cities the per-city steps process concurrently — see `maxParallelism` for the cap. */
	parallel?: number;
	/** When true, deletes this election's previously fetched data first (see `resetElectionData`)
	 * instead of the default incremental "skip what's already there" behavior. */
	fullRun?: boolean;
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
const TOTAL_STEPS = 11;

/**
 * Re-derives everything that depends on the party-family mapping for an already-crawled election —
 * the central-count placeholder cleanup (see neutralizeCentralCountPlaceholders), the mapping
 * itself, the region/district aggregates and Stuttgart's polling-station aggregates — without
 * re-fetching anything. Run after changing the families (party-families.csv) or the
 * matching rules in partyFamily.ts; see scripts/remap-parties.ts. (Seat counts need nothing: they're
 * resolved through the mapping at query time.)
 */
export async function remapPartyFamilies(db: Db, params: CrawlParams, log: Logger) {
	await neutralizeCentralCountPlaceholders(db, params.date, params.electionTypeId, log);
	await updatePartyFamily(db, params.date, params.electionTypeId, true, log);
	await updateAggregateParty(db, params.date, params.electionTypeId, true, log);
	const districtRows = STUTTGART_DISTRICTS[params.date];
	if (districtRows)
		await updateMappingStuttgart(db, districtRows, params.date, params.electionTypeId, log);
	const postal = WAHLBEZIRK_POSTAL[params.date];
	if (postal) await updateWahlbezirkAggregates(db, postal, params.date, params.electionTypeId, log);
}

/** A Landtagswahl imported from the Statistisches Landesamt (see statistikBw.ts): none of the komm.one
 * steps apply, and the Wahlkreis of every Wahlbezirk comes with the import. */
async function runStatistikBwCrawl(db: Db, params: CrawlParams, log: Logger) {
	const steps = [
		'Landtagswahl vom Statistischen Landesamt importieren',
		'Parteifamilien zuordnen',
		'Aggregate berechnen'
	];
	const postal = WAHLBEZIRK_POSTAL[params.date];
	if (postal) steps.push('Wahlbezirke mit anteiliger Briefwahl berechnen');
	const stepTick = (i: number) =>
		log(steps[i], { level: 'step', index: i + 1, total: steps.length, label: steps[i] });

	stepTick(0);
	await importStatistikBw(db, params.date, log);
	stepTick(1);
	await updatePartyFamily(db, params.date, params.electionTypeId, true, log);
	stepTick(2);
	await updateAggregateParty(db, params.date, params.electionTypeId, true, log);
	if (postal) {
		stepTick(3);
		await updateWahlbezirkAggregates(db, postal, params.date, params.electionTypeId, log);
	}
	log('Crawl abgeschlossen');
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

	const parallel = params.parallel ?? DEFAULT_PARALLEL;

	// Not counted as one of the 8 steps (keeps the step total constant regardless of this flag) — a
	// one-off cleanup before the normal sequence starts, not a stage of it.
	if (params.fullRun) {
		await resetElectionData(db, params.date, params.electionTypeId, log);
	}
	if (hasStatistikBwSource(params.date, params.electionTypeId))
		return runStatistikBwCrawl(db, params, log);

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
	await neutralizeCentralCountPlaceholders(db, params.date, params.electionTypeId, log);

	stepTick('Wahlkreis-Gemeinden-Zuordnung importieren');
	// Must run before the html5 import (which splits Gemeinden spanning several Wahlkreise by it) and
	// `updateAggregateParty` (which computes the Wahlkreis-grain aggregates from
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

	stepTick('Fehlende Gemeinden aus html5-Export ergänzen');
	// Gemeinden that published this Wahltermin only as votemanager's static html5 export (no JSON API)
	// — Landtagswahl 2016/2021 almost everywhere. Before the Kreis import, which would otherwise fill
	// them with one whole-Gemeinde row instead of their polling stations.
	await importHtml5OpenData(db, cityList, params.date, params.electionTypeId, log, parallel);
	await mapJsonStationsToWahlkreise(db, cityList, params.date, params.electionTypeId, log);

	stepTick('Fehlende Gemeinden aus Kreis-Open-Data ergänzen');
	// After the per-city steps, which would otherwise look these Gemeinden up on komm.one in vain.
	await importKreisOpenData(db, cityList, params.date, log);
	await setElectionType(db, log);

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
