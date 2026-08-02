import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	electionResult,
	electionResultPs,
	electionPartyFamily,
	party,
	pollingStations,
	electionVoteDistrictMapping,
	electionResultAggregateMetaRegion,
	electionResultAggregatePartyRegion,
	electionResultAggregateMetaDistrict,
	electionResultAggregatePartyDistrict
} from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

const STUTTGART_RS = 81110000000;

type Grain = 'gemeinde' | 'kreis' | 'regierungsbezirk';

/**
 * Port of the Kreis/Regierungsbezirk `rs` truncation in `update_aggregate_party`: take the first 4 (Kreis)
 * or 2 (Regierungsbezirk) digits of `rs` and right-pad with zeros back to 11 digits, e.g. Kreis rs
 * `81110000000` stays `81110000000`, Regierungsbezirk becomes `81000000000`.
 */
function grainRsExpr(alias: string, grain: Grain): string {
	switch (grain) {
		case 'gemeinde':
			return `${alias}.rs`;
		case 'kreis':
			return `(rpad(substr(${alias}.rs::text, 1, 4), 11, '0'))::bigint`;
		case 'regierungsbezirk':
			return `(rpad(substr(${alias}.rs::text, 1, 2), 11, '0'))::bigint`;
	}
}

async function insertMetaRegionAggregate(db: Db, type: number, date: string, grain: Grain) {
	const rsExpr = grainRsExpr('erp', grain);
	await db.execute(sql`
		INSERT INTO election_result_aggregate_meta_region
			(rs, election_type, date, votetype_id, votes_eligible, voters, invalid_ballots, valid_ballots, votes_cast, turnout)
		SELECT ${sql.raw(rsExpr)} AS rs, ${type}, ${date}, erp.votetype_id,
			COALESCE(SUM(erp.votes_eligible), 0),
			COALESCE(SUM(erp.voters), 0),
			COALESCE(SUM(erp.invalid_ballots), 0),
			COALESCE(SUM(erp.valid_ballots), 0),
			COALESCE(SUM(erp.votes_cast), 0),
			COALESCE(SUM(erp.voters), 0) / NULLIF(COALESCE(SUM(erp.votes_eligible), 0), 0)
		FROM election_result_ps erp
		JOIN elections e ON e.election_id = erp.election_id AND e.rs = erp.rs
		WHERE e.election_type = ${type} AND e.date = ${date}
		GROUP BY ${sql.raw(rsExpr)}, erp.votetype_id
		ON CONFLICT ON CONSTRAINT unique_election_result_aggregate_meta_region DO NOTHING
	`);
}

/**
 * Rows whose party never got classified into a family (`update_party_family` found no match) are
 * excluded here rather than inserted with a NULL `party_family_id` — the R original's target table had
 * no NOT NULL constraint on that column, but this port's schema does (see schema.ts comment); dropping
 * unclassified rows is the closest safe equivalent instead of crashing the whole aggregation.
 */
async function insertPartyRegionAggregate(db: Db, type: number, date: string, grain: Grain) {
	const erRs = grainRsExpr('er', grain);
	const erpRs = grainRsExpr('erp', grain);
	await db.execute(sql`
		INSERT INTO election_result_aggregate_party_region
			(party_family_id, rs, election_type, date, votetype_id, color, vote_count, vote_percent)
		SELECT agg.party_family_id, agg.rs, ${type}, ${date}, agg.votetype_id, agg.color, agg.vote_count,
			agg.vote_count::numeric / NULLIF(ct.votes_cast, 0)
		FROM (
			SELECT ${sql.raw(erRs)} AS rs, er.votetype_id, epf.party_family_id, p.color,
				COALESCE(SUM(er.vote_count), 0) AS vote_count
			FROM election_result er
			JOIN elections e ON e.election_id = er.election_id AND e.rs = er.rs
			LEFT JOIN election_party_family epf ON epf.rs = er.rs AND epf.votetype_id = er.votetype_id
				AND epf.election_id = er.election_id AND epf.party_id = er.party_id
			LEFT JOIN party p ON p.party_family_id = epf.party_family_id
			WHERE e.election_type = ${type} AND e.date = ${date} AND epf.party_family_id IS NOT NULL
			GROUP BY ${sql.raw(erRs)}, er.votetype_id, epf.party_family_id, p.color
		) agg
		LEFT JOIN (
			SELECT ${sql.raw(erpRs)} AS rs, erp.votetype_id, COALESCE(SUM(erp.votes_cast), 0) AS votes_cast
			FROM election_result_ps erp
			JOIN elections e ON e.election_id = erp.election_id AND e.rs = erp.rs
			WHERE e.election_type = ${type} AND e.date = ${date}
			GROUP BY ${sql.raw(erpRs)}, erp.votetype_id
		) ct ON ct.rs = agg.rs AND ct.votetype_id = agg.votetype_id
		ON CONFLICT ON CONSTRAINT unique_election_result_aggregate_party_region DO NOTHING
	`);
}

interface DistrictMetaRow {
	rs: number;
	psId: number;
	votetypeId: number;
	electionId: number;
	votesEligible: string | null;
	voters: string | null;
	invalidBallots: string | null;
	validBallots: string | null;
	votesCast: string | null;
}

/**
 * Port of the Wahlkreis (voting district) branch of `update_aggregate_party`, only run for Bundestags-
 * (2) and Landtagswahlen (3). Only Stuttgart's district mapping is auto-populated by this crawler (via
 * `updateMappingStuttgart`); every other municipality's mapping comes from a manual statewide import
 * that's assumed to already be in `election_vote_district_mapping` — see the Phase 3 plan findings.
 */
async function updateAggregateDistrict(db: Db, type: number, date: string, log: Logger) {
	const mapping = await db
		.select()
		.from(electionVoteDistrictMapping)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, type),
				eq(electionVoteDistrictMapping.date, date)
			)
		);

	const multiDistrictRs = new Set(
		mapping.filter((m) => m.psId !== null && m.rs !== null).map((m) => m.rs)
	);
	const psMapping = new Map(
		mapping.filter((m) => m.psId !== null).map((m) => [`${m.rs}:${m.psId}`, m.districtId])
	);
	const rsMapping = new Map(
		mapping.filter((m) => m.psId === null).map((m) => [m.rs, m.districtId])
	);

	const metaRows: DistrictMetaRow[] = await db
		.select({
			rs: electionResultPs.rs,
			psId: electionResultPs.psId,
			votetypeId: electionResultPs.votetypeId,
			electionId: electionResultPs.electionId,
			votesEligible: electionResultPs.votesEligible,
			voters: electionResultPs.voters,
			invalidBallots: electionResultPs.invalidBallots,
			validBallots: electionResultPs.validBallots,
			votesCast: electionResultPs.votesCast
		})
		.from(electionResultPs)
		.innerJoin(
			elections,
			and(
				eq(elections.electionId, electionResultPs.electionId),
				eq(elections.rs, electionResultPs.rs)
			)
		)
		.where(and(eq(elections.electionType, type), eq(elections.date, date)));

	if (metaRows.length === 0) return;

	const districtIds: (number | null)[] = metaRows.map((row) =>
		multiDistrictRs.has(row.rs)
			? (psMapping.get(`${row.rs}:${row.psId}`) ?? null)
			: (rsMapping.get(row.rs) ?? null)
	);

	const unresolvedCount = districtIds.filter((d) => d === null).length;
	if (unresolvedCount > 0) {
		// Faithfully replicates the R original's `selected_results_meta_dis$election_id[1]` — the first
		// row's election_id across the *entire* statewide result set, not just the unresolved rows. This
		// only works because in practice the only unresolved rows are Stuttgart's (see plan findings).
		const fallbackElectionId = metaRows[0].electionId;
		const stuttgartStations = await db
			.select({ psId: pollingStations.psId, name: pollingStations.name })
			.from(pollingStations)
			.where(
				and(
					eq(pollingStations.rs, STUTTGART_RS),
					eq(pollingStations.electionId, fallbackElectionId),
					eq(pollingStations.date, date)
				)
			);
		const nameByPsId = new Map(stuttgartStations.map((s) => [s.psId, s.name ?? '']));
		const specialPrefixes = [
			'001',
			'002',
			'004',
			'005',
			'007',
			'009',
			'011',
			'012',
			'016',
			'017',
			'020'
		];

		for (let i = 0; i < districtIds.length; i++) {
			if (districtIds[i] !== null) continue;
			const name = nameByPsId.get(metaRows[i].psId) ?? '';
			districtIds[i] = specialPrefixes.some((p) => name.startsWith(p)) ? 258 : 259;
		}
		log(`${unresolvedCount} Wahlbezirke ohne Wahlkreis-Zuordnung, über Bezirksnamen aufgelöst`);
	}

	const districtByPsKey = new Map<string, number>();
	const metaGroups = new Map<
		string,
		{
			districtId: number;
			votetypeId: number;
			votesEligible: number;
			voters: number;
			invalidBallots: number;
			validBallots: number;
			votesCast: number;
		}
	>();

	for (let i = 0; i < metaRows.length; i++) {
		const row = metaRows[i];
		const districtId = districtIds[i];
		if (districtId === null) continue;
		districtByPsKey.set(`${row.rs}:${row.psId}:${row.votetypeId}`, districtId);

		const key = `${districtId}:${row.votetypeId}`;
		const group = metaGroups.get(key) ?? {
			districtId,
			votetypeId: row.votetypeId,
			votesEligible: 0,
			voters: 0,
			invalidBallots: 0,
			validBallots: 0,
			votesCast: 0
		};
		group.votesEligible += Number(row.votesEligible ?? 0);
		group.voters += Number(row.voters ?? 0);
		group.invalidBallots += Number(row.invalidBallots ?? 0);
		group.validBallots += Number(row.validBallots ?? 0);
		group.votesCast += Number(row.votesCast ?? 0);
		metaGroups.set(key, group);
	}

	for (const group of metaGroups.values()) {
		await db
			.insert(electionResultAggregateMetaDistrict)
			.values({
				districtId: group.districtId,
				electionType: type,
				date,
				votetypeId: group.votetypeId,
				votesEligible: group.votesEligible.toString(),
				voters: group.voters.toString(),
				invalidBallots: group.invalidBallots.toString(),
				validBallots: group.validBallots.toString(),
				votesCast: group.votesCast.toString(),
				turnout: group.votesEligible === 0 ? null : (group.voters / group.votesEligible).toString()
			})
			.onConflictDoNothing();
	}

	const resultRows = await db
		.select({
			rs: electionResult.rs,
			psId: electionResult.psId,
			votetypeId: electionResult.votetypeId,
			voteCount: electionResult.voteCount,
			partyFamilyId: electionPartyFamily.partyFamilyId,
			color: party.color
		})
		.from(electionResult)
		.innerJoin(
			elections,
			and(eq(elections.electionId, electionResult.electionId), eq(elections.rs, electionResult.rs))
		)
		.leftJoin(
			electionPartyFamily,
			and(
				eq(electionPartyFamily.rs, electionResult.rs),
				eq(electionPartyFamily.votetypeId, electionResult.votetypeId),
				eq(electionPartyFamily.electionId, electionResult.electionId),
				eq(electionPartyFamily.partyId, electionResult.partyId)
			)
		)
		.leftJoin(party, eq(party.partyFamilyId, electionPartyFamily.partyFamilyId))
		.where(and(eq(elections.electionType, type), eq(elections.date, date)));

	const partyGroups = new Map<
		string,
		{
			districtId: number;
			votetypeId: number;
			partyFamilyId: number;
			color: string | null;
			voteCount: number;
		}
	>();
	for (const row of resultRows) {
		if (row.partyFamilyId === null) continue;
		const districtId = districtByPsKey.get(`${row.rs}:${row.psId}:${row.votetypeId}`);
		if (districtId === undefined) continue;

		const key = `${districtId}:${row.votetypeId}:${row.partyFamilyId}:${row.color}`;
		const group = partyGroups.get(key) ?? {
			districtId,
			votetypeId: row.votetypeId,
			partyFamilyId: row.partyFamilyId,
			color: row.color,
			voteCount: 0
		};
		group.voteCount += Number(row.voteCount ?? 0);
		partyGroups.set(key, group);
	}

	for (const group of partyGroups.values()) {
		const votesCast = metaGroups.get(`${group.districtId}:${group.votetypeId}`)?.votesCast ?? 0;
		await db
			.insert(electionResultAggregatePartyDistrict)
			.values({
				districtId: group.districtId,
				electionType: type,
				date,
				partyFamilyId: group.partyFamilyId,
				color: group.color,
				votetypeId: group.votetypeId,
				voteCount: group.voteCount,
				votePercent: votesCast === 0 ? null : (group.voteCount / votesCast).toString()
			})
			.onConflictDoNothing();
	}
}

/** Port of `update_aggregate_party`. */
export async function updateAggregateParty(
	db: Db,
	date: string,
	electionTypeId: number,
	override: boolean,
	log: Logger
) {
	if (override) {
		await db
			.delete(electionResultAggregateMetaDistrict)
			.where(
				and(
					eq(electionResultAggregateMetaDistrict.electionType, electionTypeId),
					eq(electionResultAggregateMetaDistrict.date, date)
				)
			);
		await db
			.delete(electionResultAggregatePartyDistrict)
			.where(
				and(
					eq(electionResultAggregatePartyDistrict.electionType, electionTypeId),
					eq(electionResultAggregatePartyDistrict.date, date)
				)
			);
		await db
			.delete(electionResultAggregateMetaRegion)
			.where(
				and(
					eq(electionResultAggregateMetaRegion.electionType, electionTypeId),
					eq(electionResultAggregateMetaRegion.date, date)
				)
			);
		await db
			.delete(electionResultAggregatePartyRegion)
			.where(
				and(
					eq(electionResultAggregatePartyRegion.electionType, electionTypeId),
					eq(electionResultAggregatePartyRegion.date, date)
				)
			);
	}

	for (const grain of ['gemeinde', 'kreis', 'regierungsbezirk'] as const) {
		log(`Aggregation für Ebene "${grain}" berechnen`);
		await insertMetaRegionAggregate(db, electionTypeId, date, grain);
		await insertPartyRegionAggregate(db, electionTypeId, date, grain);
	}

	if (electionTypeId === 2 || electionTypeId === 3) {
		log('Aggregation für Wahlkreise berechnen');
		await updateAggregateDistrict(db, electionTypeId, date, log);
	}
}
