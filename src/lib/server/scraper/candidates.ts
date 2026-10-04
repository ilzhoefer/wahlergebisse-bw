import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { electionCandidate } from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/** SQL twin of nameKey (map/queries.ts): lower-cased tokens minus titles, sorted in code-point order. */
export const nameKeySql = (column: ReturnType<typeof sql>) => sql`(
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
			SELECT rs, election_id, party_id, ${nameKeySql(sql`name`)} AS key
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
		CROSS JOIN LATERAL (SELECT ${nameKeySql(sql`t.candidate_name`)} AS key) k
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

/** A Wahlkreis's mandate holders (mandates/<date>.json, see map/mandates.ts), for full names. */
export interface MandatePerson {
	districtId: string;
	name: string;
	party: string;
}

/**
 * Bundestag/Landtag: every Erststimme candidate (the "Nachname, Partei" rows of votetype 0) with
 * their votes per Gemeinde and Wahlkreis — a Gemeinde split across Wahlkreise (Stuttgart, …) gets
 * a row per Wahlkreis via its stations. Full names come from the list's long label ("Anna
 * Christmann, BÜNDNIS 90/DIE GRÜNEN") where any Gemeinde of the Wahlkreis has it; else from the
 * mandate files for anyone who won a seat. Candidates left without a first name (Landtag 2016/2021
 * open-data imports mostly carry surnames only) keep the label and can't be matched to a person.
 */
export async function updateErststimmeCandidates(
	db: Db,
	date: string,
	electionTypeId: number,
	mandates: MandatePerson[],
	log: Logger
) {
	await db
		.delete(electionCandidate)
		.where(
			and(eq(electionCandidate.electionType, electionTypeId), eq(electionCandidate.date, date))
		);

	const [{ n, expected }] = (await db.execute(sql`
		WITH el AS (
			SELECT election_id, rs FROM elections WHERE election_type = ${electionTypeId} AND date = ${date}
		),
		-- The mapping repeats whole-Gemeinde rows (ps_id null), and a Gemeinde split across Wahlkreise
		-- has one per Wahlkreis — so, like updateAggregateDistrict: station rows where a Gemeinde has
		-- them, else its whole-Gemeinde Wahlkreis if there's exactly one.
		map AS (
			SELECT DISTINCT rs, ps_id, district_id FROM election_vote_district_mapping
			WHERE election_type = ${electionTypeId} AND date = ${date}
		),
		by_station AS (SELECT DISTINCT rs FROM map WHERE ps_id IS NOT NULL),
		whole AS (
			SELECT rs, min(district_id) AS district_id FROM map WHERE ps_id IS NULL
			GROUP BY rs HAVING count(DISTINCT district_id) = 1
		),
		r AS (
			SELECT er.rs, er.election_id, er.party_id, er.candidate_name AS label, er.vote_count,
				CASE WHEN er.rs IN (SELECT rs FROM by_station) THEN m.district_id ELSE w.district_id END
					AS district_id
			FROM election_result er
			JOIN el USING (election_id, rs)
			LEFT JOIN map m ON m.rs = er.rs AND m.ps_id = er.ps_id
			LEFT JOIN whole w ON w.rs = er.rs
			WHERE er.votetype_id = 0 AND er.candidate_name <> ''
		),
		-- Stations without a mapping (Stuttgart's postal districts) belong to the Wahlkreis where the
		-- same candidate label appears: each candidate runs in exactly one.
		lbl AS (SELECT DISTINCT rs, election_id, label, district_id FROM r WHERE district_id IS NOT NULL),
		tot0 AS (
			SELECT r.rs, r.election_id, r.party_id, r.label,
				coalesce(r.district_id, (SELECT min(l.district_id) FROM lbl l
					WHERE l.rs = r.rs AND l.election_id = r.election_id AND l.label = r.label)) AS district_id,
				sum(r.vote_count)::int AS votes
			FROM r GROUP BY 1, 2, 3, 4, 5
		),
		-- Gemeinden imported from Kreis open data label Erststimmen by party only ("CDU"); a party has
		-- one candidate per Wahlkreis, so those votes are that candidate's ("Mustermann, CDU").
		canon AS (
			SELECT district_id, regexp_replace(label, '^.*?, ', '') AS party, min(label) AS label
			FROM tot0 WHERE label LIKE '%, %'
			GROUP BY 1, 2 HAVING count(DISTINCT label) = 1
		),
		tot AS (
			SELECT t.rs, t.election_id, t.party_id, coalesce(c.label, t.label) AS label, t.district_id,
				t.votes
			FROM tot0 t
			LEFT JOIN canon c ON t.label NOT LIKE '%, %' AND c.district_id = t.district_id
				AND c.party = t.label
			WHERE t.label LIKE '%, %' OR c.label IS NOT NULL
		),
		-- election_party keeps one label per party and Gemeinde (from its first station), so in a
		-- Gemeinde split across Wahlkreise it names only that station's Wahlkreis's candidate — take
		-- the full name only there, or the other Wahlkreis's votes would go to the wrong person.
		full_name AS (
			SELECT t.district_id, t.label, min(split_part(ep.name_long, ', ', 1)) AS name
			FROM tot t JOIN election_party ep ON ep.rs = t.rs AND ep.election_id = t.election_id
				AND ep.party_id = t.party_id AND ep.votetype_id = 0 AND ep.name = t.label
			WHERE split_part(ep.name_long, ', ', 1) ~ '\\s'
				AND (t.rs NOT IN (SELECT rs FROM by_station) OR EXISTS (
					SELECT 1 FROM map mm
					WHERE mm.rs = ep.rs AND mm.ps_id = ep.ps_id AND mm.district_id = t.district_id))
			GROUP BY 1, 2
		),
		ins AS (
			INSERT INTO election_candidate (rs, election_type, date, election_id, party_id, list_name,
				name, name_key, district_id, votes, elected)
			SELECT t.rs, ${electionTypeId}, ${date}, t.election_id, t.party_id,
				regexp_replace(t.label, '^.*?, ', ''), coalesce(f.name, t.label),
				${nameKeySql(sql`coalesce(f.name, t.label)`)}, t.district_id, t.votes, NULL
			FROM tot t LEFT JOIN full_name f USING (district_id, label)
			ON CONFLICT DO NOTHING
			RETURNING 1
		)
		SELECT (SELECT count(*)::int FROM ins) AS n, (SELECT count(*)::int FROM tot) AS expected
	`)) as unknown as { n: number; expected: number }[];
	if (n < expected)
		log(`${expected - n} Kandidaturen wegen doppelter Namen verworfen`, undefined, 'warn');

	// Winners whose label found no long name (split cities, Landtag 2016/2021): the mandate files
	// have their full names — match by Wahlkreis, party and surname.
	let named = 0;
	for (const p of mandates) {
		const surname = p.name.trim().split(/\s+/).at(-1)!;
		const updated = (await db.execute(sql`
			UPDATE election_candidate SET name = ${p.name}, name_key = ${nameKeySql(sql`${p.name}::text`)}
			WHERE election_type = ${electionTypeId} AND date = ${date} AND district_id = ${Number(p.districtId)}
				AND list_name = ${p.party} AND name LIKE '%, %'
				AND split_part(name, ', ', 1) ~ ('(^|\\s)' || ${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} || '$')
			RETURNING 1
		`)) as unknown as unknown[];
		if (updated.length) named++;
	}
	log(`${n} Erststimmen-Kandidaturen gespeichert, ${named} Namen aus den Mandatsdaten ergänzt`);
}

/** Everyone named in one election's mandate data (Wahlkreis winners, with or without seat, and list
 * members who ran in a Wahlkreis). */
export function mandatePeople(
	mandates: {
		districtId: string;
		direct: { name: string | null; party: string } | null;
		list: { name: string; party: string }[];
	}[]
): MandatePerson[] {
	return mandates.flatMap((m) => [
		...(m.direct?.name
			? [{ districtId: m.districtId, name: m.direct.name, party: m.direct.party }]
			: []),
		...m.list.map((l) => ({ districtId: m.districtId, name: l.name, party: l.party }))
	]);
}
