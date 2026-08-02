import { and, eq, inArray, sum } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	cities,
	elections,
	party,
	pollingStations,
	electionResult,
	electionParty,
	electionPartyFamily,
	electionResultAggregateMetaRegion,
	electionResultAggregatePartyRegion
} from '$lib/server/db/schema';

type Db = typeof DbType;

export async function getCities(db: Db) {
	return db.select({ rs: cities.rs, name: cities.name }).from(cities).orderBy(cities.name);
}

/** Turnout/meta numbers per selected municipality. */
export async function getMetaRows(db: Db, rsList: number[], electionType: number, date: string) {
	return db
		.select({
			rs: electionResultAggregateMetaRegion.rs,
			cityName: cities.name,
			votetypeId: electionResultAggregateMetaRegion.votetypeId,
			votesEligible: electionResultAggregateMetaRegion.votesEligible,
			voters: electionResultAggregateMetaRegion.voters,
			invalidBallots: electionResultAggregateMetaRegion.invalidBallots,
			validBallots: electionResultAggregateMetaRegion.validBallots,
			votesCast: electionResultAggregateMetaRegion.votesCast,
			turnout: electionResultAggregateMetaRegion.turnout
		})
		.from(electionResultAggregateMetaRegion)
		.innerJoin(cities, eq(electionResultAggregateMetaRegion.rs, cities.rs))
		.where(
			and(
				eq(electionResultAggregateMetaRegion.electionType, electionType),
				eq(electionResultAggregateMetaRegion.date, date),
				inArray(electionResultAggregateMetaRegion.rs, rsList)
			)
		);
}

/** Per-municipality party totals (already party-family grain — the "person=false" case reuses this). */
export async function getAggregateRows(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
) {
	return db
		.select({
			rs: electionResultAggregatePartyRegion.rs,
			cityName: cities.name,
			partyNameShort: party.nameShort,
			partyNameLong: party.nameLong,
			votetypeId: electionResultAggregatePartyRegion.votetypeId,
			voteCount: electionResultAggregatePartyRegion.voteCount,
			votePercent: electionResultAggregatePartyRegion.votePercent
		})
		.from(electionResultAggregatePartyRegion)
		.innerJoin(cities, eq(electionResultAggregatePartyRegion.rs, cities.rs))
		.innerJoin(party, eq(electionResultAggregatePartyRegion.partyFamilyId, party.partyFamilyId))
		.where(
			and(
				eq(electionResultAggregatePartyRegion.electionType, electionType),
				eq(electionResultAggregatePartyRegion.date, date),
				inArray(electionResultAggregatePartyRegion.rs, rsList)
			)
		);
}

/** Polling station metadata (address, accessibility, postal flag). */
export async function getStationMetaRows(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
) {
	return db
		.select({
			rs: pollingStations.rs,
			cityName: cities.name,
			psId: pollingStations.psId,
			name: pollingStations.name,
			address: pollingStations.address,
			description: pollingStations.description,
			isPostal: pollingStations.isPostal
		})
		.from(pollingStations)
		.innerJoin(cities, eq(pollingStations.rs, cities.rs))
		.innerJoin(
			elections,
			and(
				eq(pollingStations.electionId, elections.electionId),
				eq(pollingStations.rs, elections.rs)
			)
		)
		.where(
			and(
				eq(elections.electionType, electionType),
				eq(elections.date, date),
				inArray(pollingStations.rs, rsList)
			)
		);
}

/** Per-polling-station results, broken down per candidate (the "person=true" case). */
export async function getStationResultsByCandidate(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
) {
	return db
		.select({
			rs: electionResult.rs,
			cityName: cities.name,
			psId: electionResult.psId,
			stationName: pollingStations.name,
			votetypeId: electionResult.votetypeId,
			partyName: electionParty.name,
			candidateName: electionResult.candidateName,
			voteCount: electionResult.voteCount,
			votePercent: electionResult.votePercent
		})
		.from(electionResult)
		.innerJoin(cities, eq(electionResult.rs, cities.rs))
		.innerJoin(
			elections,
			and(eq(electionResult.electionId, elections.electionId), eq(electionResult.rs, elections.rs))
		)
		.innerJoin(
			pollingStations,
			and(
				eq(electionResult.psId, pollingStations.psId),
				eq(electionResult.electionId, pollingStations.electionId),
				eq(electionResult.rs, pollingStations.rs)
			)
		)
		.innerJoin(
			electionParty,
			and(
				eq(electionResult.partyId, electionParty.partyId),
				eq(electionResult.electionId, electionParty.electionId),
				eq(electionResult.rs, electionParty.rs),
				eq(electionResult.votetypeId, electionParty.votetypeId)
			)
		)
		.where(
			and(
				eq(elections.electionType, electionType),
				eq(elections.date, date),
				inArray(electionResult.rs, rsList)
			)
		);
}

/**
 * Per-polling-station results, aggregated per party family (the "person=false" case). No precomputed
 * table covers this at station grain outside Stuttgart (election_result_aggregate_party_ps is
 * Stuttgart-only — see its table comment), so this sums election_result on the fly instead of reusing
 * update_aggregate_party's region-level rollup, keeping the grain the user actually asked for
 * ("pro Wahlbezirk").
 */
export async function getStationResultsByParty(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
) {
	return db
		.select({
			rs: electionResult.rs,
			cityName: cities.name,
			psId: electionResult.psId,
			stationName: pollingStations.name,
			votetypeId: electionResult.votetypeId,
			partyNameShort: party.nameShort,
			partyNameLong: party.nameLong,
			voteCount: sum(electionResult.voteCount)
		})
		.from(electionResult)
		.innerJoin(cities, eq(electionResult.rs, cities.rs))
		.innerJoin(
			elections,
			and(eq(electionResult.electionId, elections.electionId), eq(electionResult.rs, elections.rs))
		)
		.innerJoin(
			pollingStations,
			and(
				eq(electionResult.psId, pollingStations.psId),
				eq(electionResult.electionId, pollingStations.electionId),
				eq(electionResult.rs, pollingStations.rs)
			)
		)
		.innerJoin(
			electionPartyFamily,
			and(
				eq(electionResult.partyId, electionPartyFamily.partyId),
				eq(electionResult.electionId, electionPartyFamily.electionId),
				eq(electionResult.rs, electionPartyFamily.rs),
				eq(electionResult.votetypeId, electionPartyFamily.votetypeId)
			)
		)
		.innerJoin(party, eq(electionPartyFamily.partyFamilyId, party.partyFamilyId))
		.where(
			and(
				eq(elections.electionType, electionType),
				eq(elections.date, date),
				inArray(electionResult.rs, rsList)
			)
		)
		.groupBy(
			electionResult.rs,
			cities.name,
			electionResult.psId,
			pollingStations.name,
			electionResult.votetypeId,
			party.nameShort,
			party.nameLong
		);
}
