import { sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	pollingStations,
	electionResult,
	electionResultPs,
	electionParty,
	electionPartyFamily,
	electionElectedCandidates,
	electionPsPostalMapping,
	electionVoteDistrictMapping,
	electionResultAggregateMetaPs,
	electionResultAggregatePartyPs
} from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/**
 * Deletes this date+electionType's previously fetched polling stations, results, elected members, and
 * Stuttgart ps-level mapping/aggregates — backing the admin "vollständiger Neulauf" checkbox. Every
 * fetch step's inserts use `onConflictDoNothing`, so simply re-fetching without skipping
 * already-processed cities would leave stale rows untouched instead of actually replacing them; deleting
 * first makes every row genuinely fresh (and, as a side effect, means the fetch steps' own
 * `skipProcessed` "already complete" checks naturally come back false, so nothing else needs to change
 * to force a full re-fetch).
 *
 * `elections`/`elections_votetypes` (which election IDs/dates exist for each city) are deliberately left
 * alone — re-discovering them risks losing `result_id` if the upstream API's IDs happen to shift, and
 * nothing downstream actually needs them gone, only their results. The Gemeinde/Kreis/Regierungsbezirk/
 * Wahlkreis aggregate tables don't need it either: `updateAggregateParty` already deletes and recomputes
 * those unconditionally on every crawl. `election_party_family` normally gets the same unconditional
 * treatment from `updatePartyFamily` later in the sequence, but it's deleted here too (before
 * `election_party`) purely for FK ordering — `updatePartyFamily` running its own delete later would be
 * too late to unblock this function's delete of `election_party`.
 *
 * Deletion order below is load-bearing: `election_result`/`election_result_ps` FK-reference
 * `polling_stations`, and `election_party_family` FK-references `election_party` — deleting a referenced
 * row while a referencing one still exists violates the FK constraint.
 */
export async function resetElectionData(db: Db, date: string, electionTypeId: number, log: Logger) {
	log('Vorhandene Daten für diese Wahl werden gelöscht (vollständiger Neulauf)');

	const scopedToThisElection = sql`
		(rs, election_id) IN (
			SELECT rs, election_id FROM ${elections}
			WHERE election_type = ${electionTypeId} AND date = ${date}
		)
	`;
	const scopedByTypeAndDate = sql`election_type = ${electionTypeId} AND date = ${date}`;

	await db.execute(sql`DELETE FROM ${electionPartyFamily} WHERE ${scopedToThisElection}`);
	await db.execute(sql`DELETE FROM ${electionResult} WHERE ${scopedToThisElection}`);
	await db.execute(sql`DELETE FROM ${electionResultPs} WHERE ${scopedToThisElection}`);
	await db.execute(sql`DELETE FROM ${electionParty} WHERE ${scopedToThisElection}`);
	await db.execute(sql`DELETE FROM ${pollingStations} WHERE ${scopedToThisElection}`);
	await db.execute(sql`DELETE FROM ${electionElectedCandidates} WHERE ${scopedByTypeAndDate}`);
	await db.execute(sql`DELETE FROM ${electionPsPostalMapping} WHERE ${scopedByTypeAndDate}`);
	await db.execute(sql`DELETE FROM ${electionVoteDistrictMapping} WHERE ${scopedByTypeAndDate}`);
	await db.execute(sql`DELETE FROM ${electionResultAggregateMetaPs} WHERE ${scopedByTypeAndDate}`);
	await db.execute(sql`DELETE FROM ${electionResultAggregatePartyPs} WHERE ${scopedByTypeAndDate}`);
}
