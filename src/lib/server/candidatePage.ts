/**
 * Every candidacy on record under one name (/kandidat/[name]) — Gemeinderats- and Kreistagswahlen
 * (lists) and Bundestags-/Landtagswahlen (Erststimme in a Wahlkreis), from `election_candidate`. A
 * name is the only identity the sources give, so namesakes in different Gemeinden end up on the same
 * page; the page groups by place and says so.
 */
import { sql } from 'drizzle-orm';
import type { db as DbType } from '#lib/server/db/index.ts';
import { nameKey } from '#lib/server/map/queries.ts';
import { memo } from '#lib/server/queryCache.ts';
import { rsPrefix } from '#lib/map/rs.ts';
import { shortCityName } from '#lib/server/map/shareMeta.ts';
import { getWahlkreisMandates } from '#lib/server/map/mandates.ts';
import names from '#lib/server/map/region-names.json';

type Db = typeof DbType;

export interface Candidacy {
	electionType: number;
	electionDescription: string;
	date: string;
	/** Gemeinde (Gemeinderat), Kreis (Kreistag, summed over its Gemeinden) or Wahlkreis. */
	placeName: string;
	/** Gemeinde rs for Gemeinderat, Kreis rs for Kreistag, Wahlkreis number for Bundestag/Landtag —
	 * for links to the map. */
	placeRs: number;
	/** The list, or for Bundestag/Landtag the party. */
	listName: string | null;
	/** Place on the ballot list; null for Bundestag/Landtag. */
	position: number | null;
	votes: number;
	/** Gemeinderat: place on the list by votes; Bundestag/Landtag: place in the Wahlkreis (1 = won). */
	voteRank: number | null;
	/** Bundestag/Landtag: share of the Wahlkreis's Erststimmen in %. */
	sharePct: number | null;
	/** Bundestag/Landtag: how the seat was won (mandates/<date>.json); null where no data. */
	mandate: 'direct' | 'directNoSeat' | 'list' | 'none' | null;
	listPlace: number | null;
	listSize: number | null;
	listSeats: number | null;
	elected: boolean | null;
	/** The list was in alphabetical order — its positions rank nobody. */
	alphabetical: boolean;
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
				AND c.election_type IN (5, 6)
			WINDOW w AS (PARTITION BY c.rs, c.election_id, c.party_id ORDER BY c.votes DESC
				RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
		)
		SELECT l.rs, l.election_type, et.election_description, l.date, l.list_name, l.name,
			l.position, l.votes, l.elected, l.list_alphabetical, l.vote_rank, l.list_size, l.list_seats, ci.name AS city
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
		position: number | null;
		votes: number;
		elected: boolean | null;
		list_alphabetical: boolean;
		vote_rank: string;
		list_size: string;
		list_seats: string;
		city: string;
	}[];
	const wahlkreis = await loadWahlkreisCandidacies(db, key);
	if (rows.length === 0 && wahlkreis.length === 0) return null;

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
				existing.position = Math.min(existing.position ?? Infinity, r.position ?? Infinity);
				// Elected is recorded per Gemeinde of the Wahlkreis; unknown only if unknown everywhere.
				if (r.elected !== null) existing.elected = (existing.elected ?? false) || r.elected;
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
				sharePct: null,
				mandate: null,
				listPlace: null,
				listSize: null,
				listSeats: null,
				elected: r.elected,
				alphabetical: r.list_alphabetical
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
				sharePct: null,
				mandate: null,
				listPlace: null,
				listSize: Number(r.list_size),
				listSeats: r.elected === null ? null : Number(r.list_seats),
				elected: r.elected,
				alphabetical: r.list_alphabetical
			});
		}
	}

	// The most frequent spelling ("Dr. Erika Muster" beats a one-off variant).
	const spellings = new Map<string, number>();
	for (const n of [...rows.map((r) => r.name), ...wahlkreis.map((w) => w.name)])
		spellings.set(n, (spellings.get(n) ?? 0) + 1);
	const name = [...spellings].sort((a, b) => b[1] - a[1])[0][0];

	candidacies.push(...wahlkreis.map((w) => w.candidacy));
	candidacies.sort((a, b) => b.date.localeCompare(a.date) || b.electionType - a.electionType);

	return {
		name,
		candidacies,
		places: [...new Set(candidacies.filter((c) => c.electionType === 6).map((c) => c.placeName))]
	};
}

/** Bundestag/Landtag: the person's Erststimme candidacies, each summed over its Wahlkreis's Gemeinden
 * and ranked among all candidates there; the mandate comes from the official mandate data. */
async function loadWahlkreisCandidacies(
	db: Db,
	key: string
): Promise<{ name: string; candidacy: Candidacy }[]> {
	const rows = (await db.execute(sql`
		WITH mine AS (
			SELECT DISTINCT election_type, date, district_id FROM election_candidate
			WHERE name_key = ${key} AND election_type IN (2, 3) AND district_id IS NOT NULL
		),
		per_person AS (
			SELECT c.election_type, c.date, c.district_id, c.name_key, min(c.name) AS name,
				min(c.list_name) AS party, sum(c.votes)::int AS votes
			FROM election_candidate c JOIN mine USING (election_type, date, district_id)
			GROUP BY 1, 2, 3, 4
		),
		ranked AS (
			SELECT p.*,
				rank() OVER (PARTITION BY election_type, date, district_id ORDER BY votes DESC) AS vote_rank,
				sum(votes) OVER (PARTITION BY election_type, date, district_id) AS total
			FROM per_person p
		)
		SELECT r.*, et.election_description FROM ranked r
		JOIN election_type et ON et.election_type = r.election_type
		WHERE r.name_key = ${key}
	`)) as unknown as {
		election_type: number;
		date: string;
		district_id: number;
		name: string;
		party: string;
		votes: number;
		vote_rank: string;
		total: string;
		election_description: string;
	}[];

	return rows.map((r) => {
		const date = String(r.date).slice(0, 10);
		const wkNames = (
			r.election_type === 2 ? names.wahlkreisBundestag : names.wahlkreisLandtag
		) as Record<string, string>;
		const m = getWahlkreisMandates(date).find((w) => w.districtId === String(r.district_id));
		const listEntry = m?.list.find((l) => nameKey(l.name) === key);
		const mandate: Candidacy['mandate'] = !m
			? null
			: m.direct?.name && nameKey(m.direct.name) === key
				? m.direct.seat
					? 'direct'
					: 'directNoSeat'
				: listEntry
					? 'list'
					: 'none';
		return {
			name: r.name,
			candidacy: {
				electionType: r.election_type,
				electionDescription: r.election_description,
				date,
				placeName: `${r.district_id} ${wkNames[String(r.district_id)] ?? ''}`.trim(),
				placeRs: r.district_id,
				listName: r.party,
				position: null,
				votes: r.votes,
				voteRank: Number(r.vote_rank),
				sharePct: Number(r.total) > 0 ? (r.votes / Number(r.total)) * 100 : null,
				mandate,
				listPlace: listEntry?.listPlace ?? null,
				listSize: null,
				listSeats: null,
				elected: mandate === null ? null : mandate === 'direct' || mandate === 'list',
				alphabetical: false
			}
		};
	});
}

export interface PersonHit {
	name: string;
	/** List/party and election of the latest candidacy, e.g. "GRÜNE", "Bundestagswahl 2025". */
	party: string | null;
	latest: string;
	/** Distinct elections stood in. */
	elections: number;
}

/** Everyone with a candidate page whose name contains every token of `q` (case-insensitive, LIKE
 * wildcards escaped), most candidacies first. Callers enforce a minimum query length. */
export async function searchPeople(db: Db, q: string, limit = 12): Promise<PersonHit[]> {
	const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
	if (tokens.length === 0) return [];
	const escape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
	const match = sql.join(
		tokens.map((t) => sql`c.name ILIKE ${`%${escape(t)}%`}`),
		sql` AND `
	);
	return (await db.execute(sql`
		SELECT mode() WITHIN GROUP (ORDER BY c.name) AS name,
			(array_agg(c.list_name ORDER BY c.date DESC))[1] AS party,
			(array_agg(et.election_description || ' ' || extract(year FROM c.date) ORDER BY c.date DESC))[1]
				AS latest,
			count(DISTINCT (c.election_type, c.date))::int AS elections
		FROM election_candidate c JOIN election_type et USING (election_type)
		WHERE ${match}
		GROUP BY c.name_key
		ORDER BY elections DESC, name
		LIMIT ${limit}
	`)) as unknown as PersonHit[];
}
