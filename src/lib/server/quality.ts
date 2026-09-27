/**
 * Data quality report for one election (type + date), shown on /admin/qualitaet after a crawl:
 * Gemeinden without results or map aggregates, stations whose candidate/party votes don't add up to
 * the station's total, ballot lists without a party family, and impossible turnout figures.
 */
import { sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';

type Db = typeof DbType;

export interface CityIssue {
	rs: number;
	name: string;
	/** Affected Wahlbezirke (sum and turnout checks). */
	stations: number | null;
	/** Largest relative gap between summed votes and the station total, in % (sum check). */
	worstPct: number | null;
	/** Ballot lists without a party family (mapping check). */
	lists: string | null;
}

export interface QualityReport {
	/** Gemeinden with this election in `elections`. */
	gemeinden: number;
	withResults: number;
	missingResults: CityIssue[];
	missingAggregates: CityIssue[];
	sumMismatches: CityIssue[];
	unmappedParties: CityIssue[];
	turnoutIssues: CityIssue[];
}

async function rows(db: Db, query: ReturnType<typeof sql>): Promise<CityIssue[]> {
	const result = (await db.execute(query)) as unknown as Record<string, string | number | null>[];
	return result.map((r) => ({
		rs: Number(r.rs),
		name: String(r.name ?? r.rs),
		stations: r.stations == null ? null : Number(r.stations),
		worstPct: r.worst_pct == null ? null : Number(r.worst_pct),
		lists: r.lists == null ? null : String(r.lists)
	}));
}

export async function getQualityReport(
	db: Db,
	electionType: number,
	date: string
): Promise<QualityReport> {
	// Gemeinden holding this election, and whether each has any result row.
	const el = sql`el AS (
		SELECT e.election_id, e.rs,
			EXISTS (SELECT 1 FROM election_result er
				WHERE er.election_id = e.election_id AND er.rs = e.rs) AS has_results
		FROM elections e WHERE e.election_type = ${electionType} AND e.date = ${date}
	)`;

	const [
		coverage,
		missingResults,
		missingAggregates,
		sumMismatches,
		unmappedParties,
		turnoutIssues
	] = await Promise.all([
		db.execute(sql`WITH ${el}
				SELECT count(DISTINCT rs)::int AS gemeinden,
					count(DISTINCT rs) FILTER (WHERE has_results)::int AS with_results FROM el`),
		// A Gemeinde can hold several elections of one type on one date (e.g. one per Ortschaft) —
		// it only counts as missing when none of them has results.
		rows(
			db,
			sql`WITH ${el}
				SELECT el.rs, c.name FROM el JOIN cities c ON c.rs = el.rs
				GROUP BY el.rs, c.name HAVING NOT bool_or(el.has_results) ORDER BY c.name`
		),
		rows(
			db,
			sql`WITH ${el}
				SELECT DISTINCT el.rs, c.name FROM el JOIN cities c ON c.rs = el.rs
				WHERE el.has_results AND NOT EXISTS (
					SELECT 1 FROM election_result_aggregate_meta_region a
					WHERE a.rs = el.rs AND a.election_type = ${electionType} AND a.date = ${date})
				ORDER BY c.name`
		),
		rows(
			db,
			sql`WITH ${el},
				s AS (
					SELECT er.rs, er.election_id, er.ps_id, er.votetype_id, sum(er.vote_count) AS votes
					FROM election_result er JOIN el USING (election_id, rs)
					GROUP BY 1, 2, 3, 4
				)
				SELECT s.rs, c.name, count(*) AS stations,
					max(abs(s.votes - p.votes_cast) / p.votes_cast) * 100 AS worst_pct
				FROM s JOIN election_result_ps p USING (rs, election_id, ps_id, votetype_id)
				JOIN cities c ON c.rs = s.rs
				WHERE p.votes_cast > 0 AND s.votes <> p.votes_cast
				GROUP BY s.rs, c.name ORDER BY max(abs(s.votes - p.votes_cast) / p.votes_cast) DESC`
		),
		rows(
			db,
			sql`WITH ${el}
				SELECT ep.rs, c.name, string_agg(DISTINCT ep.name, ', ') AS lists
				FROM election_party ep JOIN el USING (election_id, rs) JOIN cities c ON c.rs = ep.rs
				WHERE NOT EXISTS (
					SELECT 1 FROM election_party_family f
					WHERE f.rs = ep.rs AND f.election_id = ep.election_id
						AND f.party_id = ep.party_id AND f.votetype_id = ep.votetype_id)
				GROUP BY ep.rs, c.name ORDER BY c.name`
		),
		rows(
			db,
			sql`WITH ${el}
				SELECT p.rs, c.name, count(*) AS stations
				FROM election_result_ps p JOIN el USING (election_id, rs) JOIN cities c ON c.rs = p.rs
				WHERE p.turnout > 100 OR p.voters > p.votes_eligible
				GROUP BY p.rs, c.name ORDER BY c.name`
		)
	]);

	const [counts] = coverage as unknown as { gemeinden: number; with_results: number }[];
	return {
		gemeinden: counts?.gemeinden ?? 0,
		withResults: counts?.with_results ?? 0,
		missingResults,
		missingAggregates,
		sumMismatches,
		unmappedParties,
		turnoutIssues
	};
}
