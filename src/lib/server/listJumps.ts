/**
 * Listenspringer in Gemeinderatswahlen (see $lib/map/listJump.ts): who won a seat from further down
 * their list than its seat count, and who lost one despite a place within it. Only Gemeinden whose
 * elected members the source lists (election_candidate.elected not null) take part.
 *
 * Unechte Teilortswahl: seats are allotted per Wohnbezirk and the ballot is ordered by Wohnbezirk,
 * which the source doesn't expose — so list order means less there. Such Gemeinden are recognisable
 * only when they needed an Ausgleichsitz; those are flagged and left out of the statewide ranking.
 * Alphabetically ordered lists (election_candidate.list_alphabetical) rank nobody and are skipped.
 */
import { sql } from 'drizzle-orm';
import type { db as DbType } from '#lib/server/db/index.ts';
import { memo } from '#lib/server/queryCache.ts';
import { shortCityName } from '#lib/server/map/shareMeta.ts';

type Db = typeof DbType;
const GEMEINDERAT = 6;

export interface ListJump {
	rs: number;
	city: string;
	listName: string | null;
	name: string;
	position: number;
	voteRank: number;
	votes: number;
	listSeats: number;
}

/** Candidates with their rank by votes and their list's seat count, for one election date. */
const ranked = (date: string, rs?: number) => sql`
	c AS (
		SELECT ec.rs, ec.list_name, ec.name, ec.position, ec.votes, ec.elected, ec.list_alphabetical,
			rank() OVER w AS vote_rank,
			count(*) FILTER (WHERE ec.elected) OVER w AS list_seats
		FROM election_candidate ec
		WHERE ec.election_type = ${GEMEINDERAT} AND ec.date = ${date} AND ec.elected IS NOT NULL
			${rs === undefined ? sql`` : sql`AND ec.rs = ${rs}`}
		WINDOW w AS (PARTITION BY ec.rs, ec.election_id, ec.party_id ORDER BY ec.votes DESC
			RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
	),
	teilort AS (
		SELECT DISTINCT rs FROM election_elected_candidates
		WHERE election_type = ${GEMEINDERAT} AND date = ${date} AND mandate_type = 'Ausgleichsitz'
	)`;

type Row = {
	rs: string;
	city: string;
	list_name: string | null;
	name: string;
	position: number;
	votes: number;
	vote_rank: string;
	list_seats: string;
};
const toJump = (r: Row): ListJump => ({
	rs: Number(r.rs),
	city: shortCityName(r.city),
	listName: r.list_name,
	name: r.name,
	position: r.position,
	voteRank: Number(r.vote_rank),
	votes: r.votes,
	listSeats: Number(r.list_seats)
});

export interface GemeindeListJumps {
	date: string;
	teilortswahl: boolean;
	seats: number;
	/** Lists in alphabetical order — not analysed. */
	alphabeticalLists: string[];
	jumped: ListJump[];
	pushedOut: ListJump[];
}

/** The latest Gemeinderatswahl with elected data in one Gemeinde, or null. */
export function getGemeindeListJumps(db: Db, rs: number): Promise<GemeindeListJumps | null> {
	return memo('gemeindeListJumps', rs, async () => {
		const [latest] = (await db.execute(sql`
			SELECT max(date)::text AS date FROM election_candidate
			WHERE rs = ${rs} AND election_type = ${GEMEINDERAT} AND elected IS NOT NULL
		`)) as unknown as { date: string | null }[];
		if (!latest?.date) return null;
		const date = latest.date;
		const rows = (await db.execute(sql`
			WITH ${ranked(date, rs)}
			SELECT c.*, ci.name AS city
			FROM c JOIN cities ci ON ci.rs = c.rs
			WHERE NOT c.list_alphabetical AND ((c.elected AND c.position > c.list_seats)
				OR (NOT c.elected AND c.position <= c.list_seats))
			ORDER BY c.list_seats DESC, c.list_name, c.position
		`)) as unknown as (Row & { elected: boolean })[];
		const [{ seats, alphabetical, teilort }] = (await db.execute(sql`
			SELECT count(*) FILTER (WHERE elected)::int AS seats,
				coalesce(array_agg(DISTINCT list_name) FILTER (WHERE list_alphabetical), '{}') AS alphabetical,
				EXISTS (SELECT 1 FROM election_elected_candidates WHERE rs = ${rs}
					AND election_type = ${GEMEINDERAT} AND date = ${date} AND mandate_type = 'Ausgleichsitz'
				) AS teilort
			FROM election_candidate
			WHERE rs = ${rs} AND election_type = ${GEMEINDERAT} AND date = ${date}
		`)) as unknown as { seats: number; alphabetical: string[]; teilort: boolean }[];
		return {
			date,
			teilortswahl: teilort,
			seats,
			alphabeticalLists: alphabetical,
			jumped: rows.filter((r) => r.elected).map(toJump),
			pushedOut: rows.filter((r) => !r.elected).map(toJump)
		};
	});
}

export interface StatewideListJumps {
	date: string;
	/** Gemeinderatswahl dates with elected data, newest first. */
	dates: string[];
	gemeinden: number;
	seats: number;
	jumpedSeats: number;
	/** Gemeinden left out as known unechte Teilortswahl. */
	excludedTeilort: number;
	/** Lists left out as alphabetically ordered, and all lists. */
	alphabeticalLists: number;
	lists: number;
	/** Largest jumps (list position − rank by votes) first. */
	topJumps: ListJump[];
	/** Gemeinden where the most seats went to jumpers (at least 10 seats). */
	topGemeinden: { rs: number; city: string; seats: number; jumped: number }[];
}

export function getStatewideListJumps(
	db: Db,
	date: string | null
): Promise<StatewideListJumps | null> {
	return memo('statewideListJumps', date, async () => {
		const dates = (
			(await db.execute(sql`
				SELECT DISTINCT date::text AS date FROM election_candidate
				WHERE election_type = ${GEMEINDERAT} AND elected IS NOT NULL ORDER BY 1 DESC
			`)) as unknown as { date: string }[]
		).map((r) => r.date);
		const d = date && dates.includes(date) ? date : dates[0];
		if (!d) return null;

		const [summary, topJumps, topGemeinden] = await Promise.all([
			db.execute(sql`
				WITH ${ranked(d)}
				SELECT count(DISTINCT rs)::int AS gemeinden,
					count(*) FILTER (WHERE elected AND NOT list_alphabetical)::int AS seats,
					count(*) FILTER (WHERE elected AND NOT list_alphabetical AND position > list_seats)::int
						AS jumped_seats,
					(SELECT count(*)::int FROM teilort) AS excluded,
					count(DISTINCT (rs, list_name)) FILTER (WHERE list_alphabetical)::int AS alphabetical,
					count(DISTINCT (rs, list_name))::int AS lists
				FROM c WHERE rs NOT IN (SELECT rs FROM teilort)
			`),
			db.execute(sql`
				WITH ${ranked(d)}
				SELECT c.*, ci.name AS city FROM c JOIN cities ci ON ci.rs = c.rs
				WHERE c.elected AND c.position > c.list_seats AND NOT c.list_alphabetical
					AND c.rs NOT IN (SELECT rs FROM teilort)
				ORDER BY c.position - c.vote_rank DESC, c.votes DESC LIMIT 50
			`),
			db.execute(sql`
				WITH ${ranked(d)}
				SELECT c.rs, min(ci.name) AS city, count(*) FILTER (WHERE elected)::int AS seats,
					count(*) FILTER (WHERE elected AND position > list_seats)::int AS jumped
				FROM c JOIN cities ci ON ci.rs = c.rs
				WHERE c.rs NOT IN (SELECT rs FROM teilort) AND NOT c.list_alphabetical
				GROUP BY c.rs HAVING count(*) FILTER (WHERE elected) >= 10
				ORDER BY count(*) FILTER (WHERE elected AND position > list_seats)::float
					/ count(*) FILTER (WHERE elected) DESC, 3 DESC LIMIT 20
			`)
		]);
		const [s] = summary as unknown as {
			gemeinden: number;
			seats: number;
			jumped_seats: number;
			excluded: number;
			alphabetical: number;
			lists: number;
		}[];
		return {
			date: d,
			dates,
			gemeinden: s.gemeinden,
			seats: s.seats,
			jumpedSeats: s.jumped_seats,
			excludedTeilort: s.excluded,
			alphabeticalLists: s.alphabetical,
			lists: s.lists,
			topJumps: (topJumps as unknown as Row[]).map(toJump),
			topGemeinden: (
				topGemeinden as unknown as { rs: string; city: string; seats: number; jumped: number }[]
			).map((r) => ({ ...r, rs: Number(r.rs), city: shortCityName(r.city) }))
		};
	});
}
