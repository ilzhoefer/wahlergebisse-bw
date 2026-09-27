import { and, eq } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	pollingStations,
	electionResult,
	electionResultPs,
	electionPartyFamily,
	party,
	electionResultAggregateMetaPs,
	electionResultAggregatePartyPs
} from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/** Per city rs: Briefwahlbezirk key → the Urnenwahlbezirke it serves, with their weights
 * (Wahlberechtigte mit Wahlschein) — see scripts/prepare-wahlbezirke.ts. */
export type PostalCatchments = Record<string, Record<string, Record<string, number>>>;

const keyOf = (name: string | null) => (name ?? '').split(' ')[0];

/**
 * The Wahlbezirk map's aggregates (`election_result_aggregate_*_ps`) for cities whose Briefwahlbezirke
 * don't pair 1:1 with Urnenwahlbezirke (unlike Stuttgart until 2025, see stuttgartMapping.ts): each
 * Urnenwahlbezirk gets its own votes plus a share of every Briefwahlbezirk serving it, split by the
 * served districts' voters with a Wahlschein. An estimate — the real postal votes aren't known per
 * Urnenwahlbezirk. Party-family mapping must already exist for this election.
 */
export async function updateWahlbezirkAggregates(
	db: Db,
	catchments: PostalCatchments,
	date: string,
	electionTypeId: number,
	log: Logger
) {
	for (const [rsKey, postal] of Object.entries(catchments)) {
		const rs = Number(rsKey);
		for (const table of [electionResultAggregateMetaPs, electionResultAggregatePartyPs])
			await db
				.delete(table)
				.where(and(eq(table.rs, rs), eq(table.electionType, electionTypeId), eq(table.date, date)));

		const [election] = await db
			.select({ electionId: elections.electionId })
			.from(elections)
			.where(
				and(
					eq(elections.rs, rs),
					eq(elections.electionType, electionTypeId),
					eq(elections.date, date)
				)
			);
		if (!election) continue;
		const inElection = (t: typeof electionResultPs | typeof electionResult) =>
			and(eq(t.rs, rs), eq(t.electionId, election.electionId));

		const stations = await db
			.select({
				psId: pollingStations.psId,
				name: pollingStations.name,
				isPostal: pollingStations.isPostal
			})
			.from(pollingStations)
			.where(and(eq(pollingStations.rs, rs), eq(pollingStations.electionId, election.electionId)));
		const urnPs = new Map(stations.filter((s) => !s.isPostal).map((s) => [keyOf(s.name), s.psId]));
		const postalPs = new Map(
			stations.filter((s) => s.isPostal).map((s) => [keyOf(s.name), s.psId])
		);

		// psId → [urn psId, share] it contributes to: an urn district all to itself, a postal one split.
		const shares = new Map<number, [number, number][]>();
		for (const psId of urnPs.values()) shares.set(psId, [[psId, 1]]);
		for (const [key, served] of Object.entries(postal)) {
			const psId = postalPs.get(key);
			const targets = Object.entries(served).flatMap(([k, w]) => {
				const urn = urnPs.get(k);
				return urn === undefined ? [] : [[urn, w] as [number, number]];
			});
			if (psId === undefined || targets.length === 0) {
				log(`${rs}: Briefwahlbezirk ${key} nicht zuordenbar, ohne Verteilung`, undefined, 'warn');
				continue;
			}
			// No Wahlschein holders at all (can't happen with real data) → an even split.
			const total = targets.reduce((s, [, w]) => s + w, 0);
			shares.set(
				psId,
				targets.map(([urn, w]) => [urn, total > 0 ? w / total : 1 / targets.length])
			);
		}

		const meta = new Map<
			string,
			{ eligible: number; voters: number; invalid: number; valid: number; cast: number }
		>();
		for (const m of await db.select().from(electionResultPs).where(inElection(electionResultPs)))
			for (const [urn, share] of shares.get(m.psId) ?? []) {
				const g = meta.get(`${urn}:${m.votetypeId}`) ?? {
					eligible: 0,
					voters: 0,
					invalid: 0,
					valid: 0,
					cast: 0
				};
				g.eligible += share * Number(m.votesEligible ?? 0);
				g.voters += share * Number(m.voters ?? 0);
				g.invalid += share * Number(m.invalidBallots ?? 0);
				g.valid += share * Number(m.validBallots ?? 0);
				g.cast += share * Number(m.votesCast ?? 0);
				meta.set(`${urn}:${m.votetypeId}`, g);
			}

		const results = await db
			.select({
				psId: electionResult.psId,
				votetypeId: electionResult.votetypeId,
				voteCount: electionResult.voteCount,
				partyFamilyId: electionPartyFamily.partyFamilyId,
				color: party.color
			})
			.from(electionResult)
			.innerJoin(
				electionPartyFamily,
				and(
					eq(electionPartyFamily.rs, electionResult.rs),
					eq(electionPartyFamily.electionId, electionResult.electionId),
					eq(electionPartyFamily.partyId, electionResult.partyId),
					eq(electionPartyFamily.votetypeId, electionResult.votetypeId)
				)
			)
			.innerJoin(party, eq(party.partyFamilyId, electionPartyFamily.partyFamilyId))
			.where(inElection(electionResult));
		const parties = new Map<
			string,
			{
				psId: number;
				votetypeId: number;
				partyFamilyId: number;
				color: string | null;
				votes: number;
			}
		>();
		for (const r of results)
			for (const [urn, share] of shares.get(r.psId) ?? []) {
				const k = `${urn}:${r.votetypeId}:${r.partyFamilyId}`;
				const g = parties.get(k) ?? {
					psId: urn,
					votetypeId: r.votetypeId,
					partyFamilyId: r.partyFamilyId,
					color: r.color,
					votes: 0
				};
				g.votes += share * Number(r.voteCount ?? 0);
				parties.set(k, g);
			}

		const metaRows = [...meta].map(([k, g]) => {
			const [psId, votetypeId] = k.split(':').map(Number);
			return {
				rs,
				psId,
				electionType: electionTypeId,
				date,
				votetypeId,
				votesEligible: String(Math.round(g.eligible)),
				voters: String(Math.round(g.voters)),
				invalidBallots: String(Math.round(g.invalid)),
				validBallots: String(Math.round(g.valid)),
				votesCast: String(Math.round(g.cast)),
				// A fraction here, like stuttgartMapping's (the region tables' too).
				turnout: g.eligible > 0 ? String(g.voters / g.eligible) : null
			};
		});
		const partyRows = [...parties.values()].map((g) => {
			const cast = meta.get(`${g.psId}:${g.votetypeId}`)?.cast ?? 0;
			return {
				rs,
				psId: g.psId,
				electionType: electionTypeId,
				date,
				partyFamilyId: g.partyFamilyId,
				color: g.color,
				votetypeId: g.votetypeId,
				voteCount: Math.round(g.votes),
				votePercent: cast > 0 ? String(g.votes / cast) : null
			};
		});
		for (let i = 0; i < metaRows.length; i += 1000)
			await db
				.insert(electionResultAggregateMetaPs)
				.values(metaRows.slice(i, i + 1000))
				.onConflictDoNothing();
		for (let i = 0; i < partyRows.length; i += 1000)
			await db
				.insert(electionResultAggregatePartyPs)
				.values(partyRows.slice(i, i + 1000))
				.onConflictDoNothing();
		log(`${rs}: ${urnPs.size} Wahlbezirke mit anteiliger Briefwahl berechnet`);
	}
}
