/**
 * Every candidacy on record under one name (/kandidat/[name]) — Gemeinderats- and Kreistagswahlen,
 * from `election_candidate`. A name is the only identity the sources give, so namesakes in different
 * Gemeinden end up on the same page; the page groups by place and says so.
 */
import { sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { nameKey } from '$lib/server/map/queries';
import { memo } from '$lib/server/queryCache';
import { rsPrefix } from '$lib/map/rs';
import { shortCityName } from '$lib/server/map/shareMeta';
import names from '$lib/server/map/region-names.json';

type Db = typeof DbType;

export interface Candidacy {
	electionType: number;
	electionDescription: string;
	date: string;
	/** Gemeinde (Gemeinderat) or Kreis (Kreistag, summed over its Gemeinden). */
	placeName: string;
	/** Gemeinde rs for Gemeinderat, Kreis rs for Kreistag — for links to the map. */
	placeRs: number;
	listName: string | null;
	position: number;
	votes: number;
	/** Gemeinderat only: place on the list by votes, list length and the list's seats. */
	voteRank: number | null;
	listSize: number | null;
	listSeats: number | null;
	elected: boolean | null;
}

export interface CandidatePage {
	name: string;
	candidacies: Candidacy[];
	/** Distinct places — more than one hints at namesakes. */
	places: string[];
}

export function getCandidatePage(db: Db, name: string): Promise<CandidatePage | null> {
	const key = nameKey(name);
	if (!key) return Promise.resolve(null);
	return memo('candidatePage', key, () => load(db, key));
}

async function load(db: Db, key: string): Promise<CandidatePage | null> {
	const rows = (await db.execute(sql`
		WITH mine AS (SELECT rs, election_id, party_id FROM election_candidate WHERE name_key = ${key}),
		lists AS (
			SELECT c.*,
				rank() OVER w AS vote_rank,
				count(*) OVER w AS list_size,
				count(*) FILTER (WHERE c.elected) OVER w AS list_seats
			FROM election_candidate c
			WHERE (c.rs, c.election_id, c.party_id) IN (SELECT rs, election_id, party_id FROM mine)
			WINDOW w AS (PARTITION BY c.rs, c.election_id, c.party_id ORDER BY c.votes DESC
				RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
		)
		SELECT l.rs, l.election_type, et.election_description, l.date, l.list_name, l.name,
			l.position, l.votes, l.elected, l.vote_rank, l.list_size, l.list_seats, ci.name AS city
		FROM lists l
		JOIN cities ci ON ci.rs = l.rs
		JOIN election_type et ON et.election_type = l.election_type
		WHERE l.name_key = ${key}
		ORDER BY l.date DESC, l.election_type DESC, ci.name
	`)) as unknown as {
		rs: string;
		election_type: number;
		election_description: string;
		date: string;
		list_name: string | null;
		name: string;
		position: number;
		votes: number;
		elected: boolean | null;
		vote_rank: string;
		list_size: string;
		list_seats: string;
		city: string;
	}[];
	if (rows.length === 0) return null;

	const candidacies: Candidacy[] = [];
	const kreistag = new Map<string, Candidacy>();
	for (const r of rows) {
		const date = String(r.date).slice(0, 10);
		if (r.election_type === 5) {
			// A Kreistag Wahlkreis spans several Gemeinden, each with its own row — sum per Kreis and list.
			const kreisRs = Number(rsPrefix(Number(r.rs), 4).padEnd(11, '0'));
			const k = `${date}|${kreisRs}|${r.list_name}`;
			const existing = kreistag.get(k);
			if (existing) {
				existing.votes += r.votes;
				existing.position = Math.min(existing.position, r.position);
				continue;
			}
			const entry: Candidacy = {
				electionType: 5,
				electionDescription: r.election_description,
				date,
				placeName: (names.regions as Record<string, string>)[String(kreisRs)] ?? r.city,
				placeRs: kreisRs,
				listName: r.list_name,
				position: r.position,
				votes: r.votes,
				voteRank: null,
				listSize: null,
				listSeats: null,
				elected: null
			};
			kreistag.set(k, entry);
			candidacies.push(entry);
		} else {
			candidacies.push({
				electionType: r.election_type,
				electionDescription: r.election_description,
				date,
				placeName: shortCityName(r.city),
				placeRs: Number(r.rs),
				listName: r.list_name,
				position: r.position,
				votes: r.votes,
				voteRank: Number(r.vote_rank),
				listSize: Number(r.list_size),
				listSeats: r.elected === null ? null : Number(r.list_seats),
				elected: r.elected
			});
		}
	}

	// The most frequent spelling ("Dr. Erika Muster" beats a one-off variant).
	const spellings = new Map<string, number>();
	for (const r of rows) spellings.set(r.name, (spellings.get(r.name) ?? 0) + 1);
	const name = [...spellings].sort((a, b) => b[1] - a[1])[0][0];

	return {
		name,
		candidacies,
		places: [...new Set(candidacies.filter((c) => c.electionType !== 5).map((c) => c.placeName))]
	};
}
