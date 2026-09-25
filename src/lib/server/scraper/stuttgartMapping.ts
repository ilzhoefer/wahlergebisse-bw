import { and, eq } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	pollingStations,
	electionResult,
	electionResultPs,
	electionPartyFamily,
	party,
	electionPsPostalMapping,
	electionVoteDistrictMapping,
	electionResultAggregateMetaPs,
	electionResultAggregatePartyPs
} from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

const STUTTGART_RS = 81110000000;

export interface StuttgartDistrictRow {
	AWBEZ_T: string;
	BWBEZ_T: string;
	/** Numeric district ID, but stored as a string in the source GeoJSON's property table. */
	BWKNUM_T: string | null;
	LWKNUM_T: string | null;
}

/**
 * Port of `update_mapping_stuttgart`. Stuttgart is the only municipality maintained at 1:1
 * postal/in-person polling-station resolution, so this builds `election_ps_postal_mapping` (and, for
 * Bundestags-/Landtagswahlen, `election_vote_district_mapping`) directly from the district boundary
 * file's `AWBEZ_T`/`BWBEZ_T` (in-person/postal station name prefixes) and `BWKNUM_T`/`LWKNUM_T`
 * (Bundestag/Landtag district numbers) properties, then rolls up combined in-person+postal results into
 * the `_ps` aggregate tables.
 */
export async function updateMappingStuttgart(
	db: Db,
	districtRows: StuttgartDistrictRow[],
	date: string,
	electionTypeId: number,
	log: Logger
) {
	// Unlike `updateAggregateParty`'s region-grain tables (which are explicitly cleared on `override`
	// before recomputing), these Ps-level tables previously only ever inserted with
	// `onConflictDoNothing()` — so a re-run of the crawl for the same date/election type (the
	// `crawl_run` history shows this date alone was run 4 times) never removed a stale row from an
	// earlier, since-corrected party-family classification. Both rows then coexisted forever: the old
	// (wrong) family alongside the new (correct) one, with identical vote counts, showing up as an
	// exact duplicate under the wrong party in the Wahlbezirk view (e.g. Stuttgart briefly classified
	// under a family it never actually used). Clearing first makes every run authoritative, matching
	// the region-grain behaviour.
	await db
		.delete(electionResultAggregateMetaPs)
		.where(
			and(
				eq(electionResultAggregateMetaPs.rs, STUTTGART_RS),
				eq(electionResultAggregateMetaPs.electionType, electionTypeId),
				eq(electionResultAggregateMetaPs.date, date)
			)
		);
	await db
		.delete(electionResultAggregatePartyPs)
		.where(
			and(
				eq(electionResultAggregatePartyPs.rs, STUTTGART_RS),
				eq(electionResultAggregatePartyPs.electionType, electionTypeId),
				eq(electionResultAggregatePartyPs.date, date)
			)
		);

	const stuttgartStations = await db
		.select({ psId: pollingStations.psId, name: pollingStations.name })
		.from(pollingStations)
		.innerJoin(
			elections,
			and(
				eq(elections.electionId, pollingStations.electionId),
				eq(elections.rs, pollingStations.rs)
			)
		)
		.where(
			and(
				eq(elections.electionType, electionTypeId),
				eq(elections.date, date),
				eq(pollingStations.rs, STUTTGART_RS)
			)
		);

	const metaRows = await db
		.select({
			psId: electionResultPs.psId,
			votetypeId: electionResultPs.votetypeId,
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
		.where(
			and(
				eq(elections.electionType, electionTypeId),
				eq(elections.date, date),
				eq(electionResultPs.rs, STUTTGART_RS)
			)
		);

	// The family join must include votetype_id: party_id is only unique per (electionId, rs,
	// votetypeId), and in two-vote elections Erst- and Zweitstimme are numbered differently. The R
	// original (and this port until 2026-09) omitted it, so every Bundestag result row matched both
	// votetypes' party with that number — doubled votes, partly under the wrong party (e.g. Stuttgart
	// Wahlbezirk 002-12 showing Die Linke at 41.7 % with shares summing to ~240 %).
	const resultRows = await db
		.select({
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
				eq(electionPartyFamily.electionId, electionResult.electionId),
				eq(electionPartyFamily.partyId, electionResult.partyId),
				eq(electionPartyFamily.votetypeId, electionResult.votetypeId)
			)
		)
		.leftJoin(party, eq(party.partyFamilyId, electionPartyFamily.partyFamilyId))
		.where(
			and(
				eq(elections.electionType, electionTypeId),
				eq(elections.date, date),
				eq(electionResult.rs, STUTTGART_RS)
			)
		);

	for (const row of districtRows) {
		const postalStation = stuttgartStations.find((s) => s.name?.startsWith(row.BWBEZ_T));
		const inPersonStation = stuttgartStations.find((s) => s.name?.startsWith(row.AWBEZ_T));
		const psIdPostal = postalStation?.psId ?? null;
		const psId = inPersonStation?.psId ?? null;

		if (psId === null) {
			log(`Stuttgart-Bezirk "${row.AWBEZ_T}": kein Wahlbezirk gefunden, überspringe`);
			continue;
		}

		await db
			.insert(electionPsPostalMapping)
			.values({ rs: STUTTGART_RS, electionType: electionTypeId, date, psId, psIdPostal })
			.onConflictDoNothing();

		const districtIdStr =
			electionTypeId === 2 ? row.BWKNUM_T : electionTypeId === 3 ? row.LWKNUM_T : null;
		const districtId = districtIdStr === null ? null : Number(districtIdStr);
		if (districtId !== null) {
			await db
				.insert(electionVoteDistrictMapping)
				.values({ rs: STUTTGART_RS, electionType: electionTypeId, date, psId, districtId })
				.onConflictDoNothing();
			if (psIdPostal !== null) {
				await db
					.insert(electionVoteDistrictMapping)
					.values({
						rs: STUTTGART_RS,
						electionType: electionTypeId,
						date,
						psId: psIdPostal,
						districtId
					})
					.onConflictDoNothing();
			}
		}

		const relevantPsIds = new Set([psId, psIdPostal].filter((id): id is number => id !== null));

		const metaByVotetype = new Map<
			number,
			{
				votesEligible: number;
				voters: number;
				invalidBallots: number;
				validBallots: number;
				votesCast: number;
			}
		>();
		for (const m of metaRows) {
			if (!relevantPsIds.has(m.psId)) continue;
			const group = metaByVotetype.get(m.votetypeId) ?? {
				votesEligible: 0,
				voters: 0,
				invalidBallots: 0,
				validBallots: 0,
				votesCast: 0
			};
			group.votesEligible += Number(m.votesEligible ?? 0);
			group.voters += Number(m.voters ?? 0);
			group.invalidBallots += Number(m.invalidBallots ?? 0);
			group.validBallots += Number(m.validBallots ?? 0);
			group.votesCast += Number(m.votesCast ?? 0);
			metaByVotetype.set(m.votetypeId, group);
		}

		for (const [votetypeId, group] of metaByVotetype) {
			await db
				.insert(electionResultAggregateMetaPs)
				.values({
					rs: STUTTGART_RS,
					psId,
					electionType: electionTypeId,
					date,
					votetypeId,
					votesEligible: group.votesEligible.toString(),
					voters: group.voters.toString(),
					invalidBallots: group.invalidBallots.toString(),
					validBallots: group.validBallots.toString(),
					votesCast: group.votesCast.toString(),
					turnout:
						group.votesEligible === 0 ? null : (group.voters / group.votesEligible).toString()
				})
				.onConflictDoNothing();
		}

		const partyGroups = new Map<
			string,
			{ votetypeId: number; partyFamilyId: number; color: string | null; voteCount: number }
		>();
		for (const r of resultRows) {
			if (!relevantPsIds.has(r.psId) || r.partyFamilyId === null) continue;
			const key = `${r.votetypeId}:${r.partyFamilyId}:${r.color}`;
			const group = partyGroups.get(key) ?? {
				votetypeId: r.votetypeId,
				partyFamilyId: r.partyFamilyId,
				color: r.color,
				voteCount: 0
			};
			group.voteCount += Number(r.voteCount ?? 0);
			partyGroups.set(key, group);
		}

		for (const group of partyGroups.values()) {
			const votesCast = metaByVotetype.get(group.votetypeId)?.votesCast ?? 0;
			await db
				.insert(electionResultAggregatePartyPs)
				.values({
					rs: STUTTGART_RS,
					psId,
					electionType: electionTypeId,
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
}
