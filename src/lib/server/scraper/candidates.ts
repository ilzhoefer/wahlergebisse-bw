import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { electionCandidate } from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/** SQL twin of nameKey (map/queries.ts): lower-cased tokens minus titles, sorted in code-point order. */
const nameKey = (column: ReturnType<typeof sql>) => sql`(
	SELECT string_agg(t, ' ' ORDER BY t COLLATE "C")
	FROM regexp_split_to_table(lower(${column}), '[\\s,]+') t
	WHERE t <> '' AND t !~ '^(dr|prof|dipl|ing)\\.?$' AND t !~ '\\.$'
)`;

/**
 * Rebuilds `election_candidate` for one election: every candidate of a list (rows whose name differs
 * from the list's own — lists without candidates, like a Landtagswahl's, carry the party name)
 * with their votes summed over all stations of the Gemeinde, their ballot position and whether
 * they were elected — unknown (null) where the source lists no elected members there (matched by name within the list — or within the Gemeinde where the source
 * gives an elected member no list). Ballot position = row order within one station: the scraper inserts each
 * station's rows sequentially in komm.one's order, which is the ballot order.
 */
export async function updateCandidates(db: Db, date: string, electionTypeId: number, log: Logger) {
	await db
		.delete(electionCandidate)
		.where(
			and(eq(electionCandidate.electionType, electionTypeId), eq(electionCandidate.date, date))
		);

	const inserted = (await db.execute(sql`
		WITH el AS (
			SELECT election_id, rs FROM elections WHERE election_type = ${electionTypeId} AND date = ${date}
		),
		cand AS (
			SELECT er.id, er.election_id, er.rs, er.party_id, er.ps_id, er.candidate_name, er.vote_count,
				ep.name AS list_name
			FROM election_result er
			JOIN el USING (election_id, rs)
			JOIN election_party ep ON ep.rs = er.rs AND ep.election_id = er.election_id
				AND ep.party_id = er.party_id AND ep.votetype_id = er.votetype_id
			WHERE er.votetype_id = 0 AND er.candidate_name <> '' AND er.candidate_name <> ep.name
		),
		first_ps AS (
			SELECT DISTINCT ON (election_id, rs) election_id, rs, ps_id FROM cand ORDER BY election_id, rs, id
		),
		pos AS (
			SELECT c.election_id, c.rs, c.party_id, c.candidate_name,
				row_number() OVER (PARTITION BY c.election_id, c.rs, c.party_id ORDER BY c.id) AS position
			FROM cand c JOIN first_ps USING (election_id, rs, ps_id)
		),
		tot AS (
			SELECT election_id, rs, party_id, candidate_name, min(list_name) AS list_name,
				sum(vote_count)::int AS votes
			FROM cand GROUP BY 1, 2, 3, 4
		),
		elected AS (
			SELECT rs, election_id, party_id, ${nameKey(sql`name`)} AS key
			FROM election_elected_candidates
			WHERE election_type = ${electionTypeId} AND date = ${date}
		)
		INSERT INTO election_candidate (rs, election_type, date, election_id, party_id, list_name, name,
			name_key, position, votes, elected)
		SELECT t.rs, ${electionTypeId}, ${date}, t.election_id, t.party_id, t.list_name, t.candidate_name,
			k.key, p.position, t.votes,
			CASE WHEN h.rs IS NOT NULL THEN e1.rs IS NOT NULL OR e2.rs IS NOT NULL END
		FROM tot t
		JOIN pos p USING (election_id, rs, party_id, candidate_name)
		CROSS JOIN LATERAL (SELECT ${nameKey(sql`t.candidate_name`)} AS key) k
		-- Hash joins on de-duplicated keys: whether the Gemeinde has elected data at all (h), a
		-- match on the same list (e1), or on a member the source gives no list (e2).
		LEFT JOIN (SELECT DISTINCT rs, election_id FROM elected) h
			ON h.rs = t.rs AND h.election_id = t.election_id
		LEFT JOIN (SELECT DISTINCT rs, election_id, party_id, key FROM elected) e1
			ON e1.rs = t.rs AND e1.election_id = t.election_id AND e1.party_id = t.party_id AND e1.key = k.key
		LEFT JOIN (SELECT DISTINCT rs, election_id, key FROM elected WHERE party_id IS NULL) e2
			ON e2.rs = t.rs AND e2.election_id = t.election_id AND e2.key = k.key
		WHERE k.key IS NOT NULL
		ON CONFLICT DO NOTHING
		RETURNING 1
	`)) as unknown as unknown[];

	// Alphabetical lists: neighbouring surnames (last name token, umlauts folded) in A–Z order, allowing
	// one break per 8 pairs (names appended at the end) — none up to 8 candidates. A shuffled list
	// passes with < 0.2 % probability at any length from 5 on.
	await db.execute(sql`
		WITH s AS (
			SELECT rs, election_id, party_id,
				translate(lower(regexp_replace(name, '^.*\\s', '')), 'äöüß', 'aous') AS surname,
				lag(translate(lower(regexp_replace(name, '^.*\\s', '')), 'äöüß', 'aous'))
					OVER (PARTITION BY rs, election_id, party_id ORDER BY position) AS prev
			FROM election_candidate WHERE election_type = ${electionTypeId} AND date = ${date}
		),
		alpha AS (
			SELECT rs, election_id, party_id FROM s GROUP BY 1, 2, 3
			HAVING count(*) >= 5
				AND count(*) FILTER (WHERE prev COLLATE "C" > surname COLLATE "C") <= (count(*) - 1) / 8
		)
		UPDATE election_candidate ec SET list_alphabetical = true FROM alpha
		WHERE ec.election_type = ${electionTypeId} AND ec.date = ${date}
			AND ec.rs = alpha.rs AND ec.election_id = alpha.election_id AND ec.party_id = alpha.party_id
	`);
	log(`${inserted.length} Kandidierende gespeichert`);
}
