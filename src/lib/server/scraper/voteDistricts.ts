import type { db as DbType } from '$lib/server/db';
import { electionVoteDistrictMapping } from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

export interface VoteDistrictRow {
	rs: number;
	districtId: number;
}

/**
 * Imports the official statewide Gemeinde -> Wahlkreis assignment (see
 * `scripts/prepare-vote-districts.ts` for where `rows` comes from) into
 * `election_vote_district_mapping`, one whole-municipality row per Gemeinde (`psId` left null).
 * Stuttgart is deliberately absent from `rows` — it alone is resolved dynamically, per polling
 * station, by `updateMappingStuttgart`, since its single Gemeinde straddles more than one Wahlkreis.
 *
 * Without this, `updateAggregateDistrict`'s "unresolved -> guess from polling-station name" fallback
 * (meant only for Stuttgart's own edge cases) silently bucketed every other municipality's votes into
 * whichever of its two hardcoded districts its `else` branch defaults to.
 */
export async function importVoteDistrictMapping(
	db: Db,
	rows: VoteDistrictRow[],
	date: string,
	electionTypeId: number,
	log: Logger
) {
	if (rows.length === 0) {
		log(
			`Keine Wahlkreis-Gemeinden-Zuordnung für ${date} vorhanden, überspringe`,
			undefined,
			'warn'
		);
		return;
	}
	// Idempotent per (rs, electionType, date, psId=null) — a re-run of the same date/type never
	// duplicates rows (see the table's unique constraint).
	for (const row of rows) {
		await db
			.insert(electionVoteDistrictMapping)
			.values({
				rs: row.rs,
				electionType: electionTypeId,
				date,
				psId: null,
				districtId: row.districtId
			})
			.onConflictDoNothing();
	}
	log(`${rows.length} Gemeinden-Wahlkreis-Zuordnungen importiert`);
}
