import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { KREISFREIE_STADT_RS } from '$lib/map/rs';
import { mixColors } from '$lib/map/colors';
import { postalElsewhereRs } from '$lib/server/scraper/kreisOpenData';
import {
	elections,
	electionType,
	electionResultPs,
	party,
	electionResultAggregatePartyRegion,
	electionResultAggregateMetaRegion,
	electionResultAggregatePartyDistrict,
	electionResultAggregateMetaDistrict,
	electionResultAggregatePartyPs,
	electionResultAggregateMetaPs,
	electionVoteDistrictMapping,
	electionElectedCandidates,
	electionParty,
	electionPartyFamily,
	pollingStations
} from '$lib/server/db/schema';

type Db = typeof DbType;

/** Port of shiny_get_election_types: only election types that actually have results loaded. */
export async function getElectionTypes(db: Db) {
	return db
		.selectDistinct({
			electionType: electionType.electionType,
			electionDescription: electionType.electionDescription
		})
		.from(electionResultPs)
		.innerJoin(
			elections,
			and(
				eq(electionResultPs.electionId, elections.electionId),
				eq(electionResultPs.rs, elections.rs)
			)
		)
		.innerJoin(electionType, eq(elections.electionType, electionType.electionType))
		.orderBy(electionType.electionType);
}

/** Port of shiny_get_election_dates. */
export async function getElectionDates(db: Db, typeId: number) {
	return db
		.selectDistinct({ date: elections.date })
		.from(elections)
		.innerJoin(
			electionResultPs,
			and(
				eq(electionResultPs.electionId, elections.electionId),
				eq(electionResultPs.rs, elections.rs)
			)
		)
		.where(eq(elections.electionType, typeId))
		.orderBy(desc(elections.date));
}

/** Port of shiny_get_all_election_dates. */
export async function getAllElectionDates(db: Db) {
	return db
		.selectDistinct({ electionType: elections.electionType, date: elections.date })
		.from(elections)
		.innerJoin(
			electionResultPs,
			and(
				eq(electionResultPs.electionId, elections.electionId),
				eq(electionResultPs.rs, elections.rs)
			)
		)
		.orderBy(elections.date);
}

export type MapMode = 'Regierungsbezirk' | 'Kreis' | 'Gemeinde' | 'Wahlkreis' | 'Wahlbezirk';

/**
 * Port of shiny_return_possible_map_modes. Election types: 1=Bundestagswahl?, 2=Bundestagswahl,
 * 3=Landtagswahl, 4=Regionalwahl (Stuttgart region only), 5=Kreistagswahl, 6=Gemeinderatswahl — see
 * election_type table / set_election_type's regex cascade for the authoritative mapping.
 */
export function possibleMapModes(typeId: number): {
	possibleModes: MapMode[];
	selectedMode: MapMode;
} {
	let possibleModes: MapMode[];
	if ([1, 5, 6].includes(typeId))
		possibleModes = ['Regierungsbezirk', 'Kreis', 'Gemeinde', 'Wahlbezirk'];
	else if (typeId === 4) possibleModes = ['Kreis', 'Gemeinde', 'Wahlbezirk'];
	else if ([2, 3].includes(typeId))
		possibleModes = ['Wahlkreis', 'Regierungsbezirk', 'Kreis', 'Gemeinde', 'Wahlbezirk'];
	else possibleModes = ['Gemeinde'];

	let selectedMode: MapMode;
	if (typeId === 6) selectedMode = 'Gemeinde';
	else if ([1, 4, 5].includes(typeId)) selectedMode = 'Kreis';
	else selectedMode = 'Wahlkreis';

	return { possibleModes, selectedMode };
}

/**
 * Port of shiny_get_parties, ordered by each party's total vote count across the whole of
 * Baden-Württemberg — highest state-wide performance first — so the Hochburg dropdown leads with
 * the parties users are most likely to look for instead of arbitrary ballot order. Region-level
 * rollup rows exist at Gemeinde/Kreis/Regierungsbezirk grain in the same table (see the module doc
 * on getMapInformation); a Regierungsbezirk row's `rs` is its 2-digit prefix zero-padded out to 11
 * digits (mirrors update_aggregate_party / rsPrefix), i.e. `rs % 1e9 = 0` picks out exactly the 4
 * Regierungsbezirk-level rows — already a sum over every Gemeinde in Baden-Württemberg.
 */
export interface CandidateHit {
	name: string;
	/** Candidate list as named on the ballot (e.g. "CDU", "Bürgerliste"); null if unmatched. */
	party: string | null;
	rs: number;
	electionType: number;
	date: string;
}

/**
 * Elected candidates whose name contains every whitespace-separated token of `q` (case-insensitive),
 * so "erika müller" finds "Müller, Erika". Tokens are passed as bound parameters with LIKE wildcards
 * escaped — never concatenated into SQL. Callers enforce a minimum query length.
 */
export async function searchCandidates(db: Db, q: string, limit = 20): Promise<CandidateHit[]> {
	const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
	if (tokens.length === 0) return [];
	const escape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
	const c = electionElectedCandidates;
	const rows = await db
		.select({
			name: c.name,
			// election_party has one row per votetype (and polling station) — any one carries the name;
			// a scalar subquery hits the (rs, party_id, election_id, …) unique index per result row.
			party: sql<string | null>`(select ${electionParty.name} from ${electionParty}
				where ${electionParty.rs} = ${c.rs} and ${electionParty.electionId} = ${c.electionId}
				and ${electionParty.partyId} = ${c.partyId} limit 1)`,
			rs: c.rs,
			electionType: c.electionType,
			date: c.date
		})
		.from(c)
		.where(and(...tokens.map((t) => ilike(electionElectedCandidates.name, `%${escape(t)}%`))))
		.orderBy(electionElectedCandidates.name)
		.limit(limit);
	return rows as CandidateHit[];
}

export async function getParties(db: Db, date: string, electionTypeId: number) {
	const rows = await db
		.select({
			nameShort: party.nameShort,
			partyFamilyId: party.partyFamilyId,
			voteCount: sql<number>`coalesce(sum(${electionResultAggregatePartyRegion.voteCount}), 0)`
		})
		.from(electionResultAggregatePartyRegion)
		.innerJoin(party, eq(electionResultAggregatePartyRegion.partyFamilyId, party.partyFamilyId))
		.where(
			and(
				eq(electionResultAggregatePartyRegion.electionType, electionTypeId),
				eq(electionResultAggregatePartyRegion.date, date),
				sql`${electionResultAggregatePartyRegion.rs} % 1000000000 = 0`
			)
		)
		.groupBy(party.nameShort, party.partyFamilyId)
		.orderBy(desc(sql`coalesce(sum(${electionResultAggregatePartyRegion.voteCount}), 0)`));
	return rows;
}

/**
 * Port of dplyr's `group_by(...) %>% slice_max(value, n)` with the default `with_ties = TRUE`: all
 * rows tied for a place within the top `n` distinct values are kept, so a group can return more than
 * `n` rows if there's a tie at the cutoff.
 *
 * NOTE: the original Shiny app calls this with n=2 for "2. Stärkste Partei" and then left-joins the
 * *both* top-2 rows onto one polygon per region — since a polygon can only have one fill color, that
 * produces two overlapping map polygons per region with no defined draw order. We deliberately diverge
 * here (see `secondPlaceByGroup`) and show the actual 2nd-place party, which is what the feature name
 * promises.
 */
export function sliceMaxByGroup<T>(
	rows: T[],
	groupKey: (row: T) => string,
	value: (row: T) => number | null,
	n: 1 | 2
): T[] {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = groupKey(row);
		const list = groups.get(key) ?? [];
		list.push(row);
		groups.set(key, list);
	}
	const result: T[] = [];
	for (const list of groups.values()) {
		const distinctValues = [
			...new Set(list.map(value).filter((v): v is number => v !== null))
		].sort((a, b) => b - a);
		const cutoff = distinctValues[n - 1] ?? distinctValues[distinctValues.length - 1];
		if (cutoff === undefined) continue;
		result.push(...list.filter((row) => (value(row) ?? -Infinity) >= cutoff));
	}
	return result;
}

/** Exactly the 2nd-highest distinct value per group (ties at 2nd place all included, per-group). */
export function secondPlaceByGroup<T>(
	rows: T[],
	groupKey: (row: T) => string,
	value: (row: T) => number | null
): T[] {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = groupKey(row);
		const list = groups.get(key) ?? [];
		list.push(row);
		groups.set(key, list);
	}
	const result: T[] = [];
	for (const list of groups.values()) {
		const distinctValues = [
			...new Set(list.map(value).filter((v): v is number => v !== null))
		].sort((a, b) => b - a);
		const secondPlace = distinctValues[1];
		if (secondPlace === undefined) continue;
		result.push(...list.filter((row) => value(row) === secondPlace));
	}
	return result;
}

export type MapInformationMode =
	'Stärkste Partei' | '2. Stärkste Partei' | 'Wahlbeteiligung' | 'Hochburg' | 'Stimmensplitting';

export interface MapInformationParams {
	selectedMapInformation: MapInformationMode;
	selectedMapMode: MapMode;
	selectedElectionType: number;
	selectedDate: string;
	selectedParty?: string;
	/** Restricts the region-grain (Regierungsbezirk/Kreis/Gemeinde) query to exactly these rs's — so the
	 * Wahlbeteiligung/Hochburg colour scale's min/max reflect only what's currently rendered in the map's
	 * mosaic, not every region of that grain statewide (whose extremes can sit far outside the area the
	 * user actually drilled into). Ignored for Wahlkreis, which has no rs-scoped view to begin with. */
	selectedRsList?: number[];
}

/** Comma-joined for inlining into a raw `rs in (...)` SQL fragment below — built from our own fixed
 * constant, never user input, so `sql.raw` here carries no injection risk. */
const KREISFREIE_STADT_RS_LIST = [...KREISFREIE_STADT_RS].join(',');

/**
 * `election_result_aggregate_*_region` holds Gemeinde-, Kreis- *and* Regierungsbezirk-grain rows in
 * one table, distinguished only by how many trailing zero-digits `rs` has (see `update_aggregate_party`
 * / `grainRsExpr` in aggregates.ts: Regierungsbezirk = 2 real digits + 9 zeros, Kreis = 4 + 7, Gemeinde
 * = whatever's left over) — so a query against it needs its own grain filter, or it returns all three
 * grains' rows mixed together under one `rs` column.
 */
function regionGrainFilter(mapMode: MapMode) {
	switch (mapMode) {
		case 'Regierungsbezirk':
			return sql`rs % 1000000000 = 0`;
		case 'Kreis':
			return sql`rs % 10000000 = 0 and rs % 1000000000 != 0`;
		case 'Gemeinde':
			// A kreisfreie Stadt's territory is exactly one Gemeinde (see KREISFREIE_STADT_RS's doc
			// comment), so its only aggregate row has the same "...000" trailing-zero rs as a genuine
			// Kreis-level rollup row and would otherwise never satisfy this filter at all — leaving it
			// uncoloured on the map whenever Gemeinde-grain data is requested (its Kreis-grain query,
			// from the branch above, still finds the same row and colours it fine at that grain).
			return sql`(rs % 10000000 != 0 or rs in (${sql.raw(KREISFREIE_STADT_RS_LIST)}))`;
		default:
			return undefined;
	}
}

/**
 * Gemeinde-grain rs's that actually have data for this election+date — statewide elections have
 * (almost) every one of Baden-Württemberg's ~1103 Gemeinden, but Regionalwahl only covers the Verband
 * Region Stuttgart's municipalities (which, confirmed against the actual ingested data, isn't a clean
 * Kreis-level boundary: Rottenburg am Neckar belongs to Landkreis Tübingen but is still part of the
 * region). Used by the map to hide Gemeinden it has nothing to show for at all, distinct from
 * gemeindefreie Gebiete (`NO_ELECTION_RS` on the client), which the map still renders — colourless,
 * with an explanatory hover — since those never have data for *any* election, not just this one.
 */
export async function getGemeindenWithData(
	db: Db,
	electionType: number,
	date: string
): Promise<number[]> {
	const rows = await db
		.selectDistinct({ rs: electionResultAggregateMetaRegion.rs })
		.from(electionResultAggregateMetaRegion)
		.where(
			and(
				eq(electionResultAggregateMetaRegion.electionType, electionType),
				eq(electionResultAggregateMetaRegion.date, date),
				regionGrainFilter('Gemeinde')
			)
		);
	return rows.map((r) => r.rs);
}

/**
 * Port of shiny_map_information: region/Kreis/Regierungsbezirk/Wahlkreis-grain data for the map.
 * Region/Kreis/Regierungsbezirk all read from the *_region aggregate tables (they share one rs-keyed
 * table, since a Kreis/Regierungsbezirk row is just a region row whose rs was truncated+padded at
 * scrape time — see update_aggregate_party); Wahlkreis mode reads the *_district tables instead.
 */
export async function getMapInformation(db: Db, params: MapInformationParams) {
	const {
		selectedMapInformation,
		selectedMapMode,
		selectedElectionType,
		selectedDate,
		selectedParty,
		selectedRsList
	} = params;
	const isDistrict = selectedMapMode === 'Wahlkreis';
	const grainFilter = regionGrainFilter(selectedMapMode);
	const rsListFilter =
		!isDistrict && selectedRsList
			? inArray(electionResultAggregateMetaRegion.rs, selectedRsList)
			: undefined;
	const rsListFilterParty =
		!isDistrict && selectedRsList
			? inArray(electionResultAggregatePartyRegion.rs, selectedRsList)
			: undefined;

	if (selectedMapInformation === 'Wahlbeteiligung') {
		return isDistrict
			? await db
					.select({
						districtId: electionResultAggregateMetaDistrict.districtId,
						votetypeId: electionResultAggregateMetaDistrict.votetypeId,
						turnout: electionResultAggregateMetaDistrict.turnout
					})
					.from(electionResultAggregateMetaDistrict)
					.where(
						and(
							eq(electionResultAggregateMetaDistrict.electionType, selectedElectionType),
							eq(electionResultAggregateMetaDistrict.date, selectedDate)
						)
					)
			: await db
					.select({
						rs: electionResultAggregateMetaRegion.rs,
						votetypeId: electionResultAggregateMetaRegion.votetypeId,
						turnout: electionResultAggregateMetaRegion.turnout
					})
					.from(electionResultAggregateMetaRegion)
					.where(
						and(
							eq(electionResultAggregateMetaRegion.electionType, selectedElectionType),
							eq(electionResultAggregateMetaRegion.date, selectedDate),
							grainFilter,
							rsListFilter
						)
					);
	}

	const raw = isDistrict
		? await db
				.select({
					districtId: electionResultAggregatePartyDistrict.districtId,
					votetypeId: electionResultAggregatePartyDistrict.votetypeId,
					votePercent: electionResultAggregatePartyDistrict.votePercent,
					color: electionResultAggregatePartyDistrict.color,
					nameShort: party.nameShort
				})
				.from(electionResultAggregatePartyDistrict)
				.innerJoin(
					party,
					eq(electionResultAggregatePartyDistrict.partyFamilyId, party.partyFamilyId)
				)
				.where(
					and(
						eq(electionResultAggregatePartyDistrict.electionType, selectedElectionType),
						eq(electionResultAggregatePartyDistrict.date, selectedDate)
					)
				)
		: await db
				.select({
					rs: electionResultAggregatePartyRegion.rs,
					votetypeId: electionResultAggregatePartyRegion.votetypeId,
					votePercent: electionResultAggregatePartyRegion.votePercent,
					color: electionResultAggregatePartyRegion.color,
					nameShort: party.nameShort,
					partyFamilyId: electionResultAggregatePartyRegion.partyFamilyId,
					voteCount: sql<number | null>`${electionResultAggregatePartyRegion.voteCount}::float8`
				})
				.from(electionResultAggregatePartyRegion)
				.innerJoin(party, eq(electionResultAggregatePartyRegion.partyFamilyId, party.partyFamilyId))
				.where(
					and(
						eq(electionResultAggregatePartyRegion.electionType, selectedElectionType),
						eq(electionResultAggregatePartyRegion.date, selectedDate),
						grainFilter,
						rsListFilterParty
					)
				);

	const regionKeyOf = (r: (typeof raw)[number]) => ('districtId' in r ? r.districtId : r.rs);
	const groupKey = (r: (typeof raw)[number]) => `${regionKeyOf(r)}-${r.votetypeId}`;
	const valueOf = (r: (typeof raw)[number]) =>
		r.votePercent === null ? null : Number(r.votePercent);

	const ranking =
		selectedMapInformation === 'Stärkste Partei' || selectedMapInformation === '2. Stärkste Partei';
	// Rank ballot lists, not families: a catch-all family ("Wählervereinigungen") sums unrelated local
	// lists — six of them together out-poll Pforzheim's CDU in 2019 though none alone comes close. Same
	// grains as the panel's list split (see getRegionBreakdowns).
	const splitGrain =
		selectedMapMode === 'Gemeinde'
			? 'gemeinde'
			: selectedMapMode === 'Kreis' && selectedElectionType === KREISTAGSWAHL_TYPE
				? 'kreis'
				: null;
	const ranked =
		ranking && splitGrain && !isDistrict
			? await splitForRanking(
					db,
					raw.filter((r) => 'rs' in r),
					splitGrain,
					selectedElectionType,
					selectedDate
				)
			: raw;

	if (selectedMapInformation === 'Stärkste Partei')
		return sliceMaxByGroup(ranked, groupKey, valueOf, 1);
	if (selectedMapInformation === '2. Stärkste Partei')
		return secondPlaceByGroup(ranked, groupKey, valueOf);
	// Hochburg / Stimmensplitting (the latter keeps both votetypes; the resolver pairs them up)
	return raw.filter((r) => r.nameShort === selectedParty);
}

/**
 * Port of shiny_map_information_ps: polling-station grain, populated for the Gemeinden with
 * Wahlbezirk boundaries (Stuttgart until 2025, see stuttgartMapping.ts; more since 2026, see
 * wahlbezirkAggregates.ts).
 */
export async function getMapInformationPs(
	db: Db,
	params: Omit<MapInformationParams, 'selectedMapMode'>
) {
	const { selectedMapInformation, selectedElectionType, selectedDate, selectedParty } = params;

	if (selectedMapInformation === 'Wahlbeteiligung') {
		return db
			.selectDistinct({
				rs: electionResultAggregateMetaPs.rs,
				psId: electionResultAggregateMetaPs.psId,
				votetypeId: electionResultAggregateMetaPs.votetypeId,
				turnout: electionResultAggregateMetaPs.turnout,
				name: pollingStations.name
			})
			.from(electionResultAggregateMetaPs)
			.innerJoin(
				pollingStations,
				and(
					eq(electionResultAggregateMetaPs.psId, pollingStations.psId),
					eq(electionResultAggregateMetaPs.rs, pollingStations.rs),
					eq(electionResultAggregateMetaPs.date, pollingStations.date)
				)
			)
			.where(
				and(
					eq(electionResultAggregateMetaPs.electionType, selectedElectionType),
					eq(electionResultAggregateMetaPs.date, selectedDate)
				)
			);
	}

	const raw = await db
		.selectDistinct({
			rs: electionResultAggregatePartyPs.rs,
			psId: electionResultAggregatePartyPs.psId,
			votetypeId: electionResultAggregatePartyPs.votetypeId,
			votePercent: electionResultAggregatePartyPs.votePercent,
			color: electionResultAggregatePartyPs.color,
			nameShort: party.nameShort,
			partyFamilyId: electionResultAggregatePartyPs.partyFamilyId,
			name: pollingStations.name
		})
		.from(electionResultAggregatePartyPs)
		.innerJoin(party, eq(electionResultAggregatePartyPs.partyFamilyId, party.partyFamilyId))
		.innerJoin(
			pollingStations,
			and(
				eq(electionResultAggregatePartyPs.psId, pollingStations.psId),
				eq(electionResultAggregatePartyPs.rs, pollingStations.rs),
				eq(electionResultAggregatePartyPs.date, pollingStations.date)
			)
		)
		.where(
			and(
				eq(electionResultAggregatePartyPs.electionType, selectedElectionType),
				eq(electionResultAggregatePartyPs.date, selectedDate)
			)
		);

	const groupKey = (r: (typeof raw)[number]) => `${r.rs}-${r.psId}-${r.votetypeId}`;
	const valueOf = (r: (typeof raw)[number]) =>
		r.votePercent === null ? null : Number(r.votePercent);

	if (
		selectedMapInformation === 'Stärkste Partei' ||
		selectedMapInformation === '2. Stärkste Partei'
	) {
		// Like getMapInformation's region split: a catch-all family ranks by its largest single list.
		const largest = await largestCatchAllListPs(db, selectedElectionType, selectedDate);
		const ranked = raw.map((r) => {
			const share = largest.get(`${r.psId}:${r.votetypeId}:${r.partyFamilyId}`);
			return share === undefined ? r : { ...r, votePercent: String(share) };
		});
		return selectedMapInformation === 'Stärkste Partei'
			? sliceMaxByGroup(ranked, groupKey, valueOf, 1)
			: secondPlaceByGroup(ranked, groupKey, valueOf);
	}
	return raw.filter((r) => r.nameShort === selectedParty);
}

/**
 * Stuttgart Wahlbezirke: per (ps_id, votetype, catch-all family), the share of that family's largest
 * single list — urn votes plus its mapped postal district's, like `election_result_aggregate_party_ps`
 * (see stuttgartMapping.ts), and scaled by that table's own share-per-vote.
 */
async function largestCatchAllListPs(
	db: Db,
	electionType: number,
	date: string
): Promise<Map<string, number>> {
	const result = await db.execute(sql`
		WITH lists AS (
			SELECT m.ps_id, er.votetype_id, epf.party_family_id, er.party_id,
				SUM(er.vote_count)::float8 AS votes
			FROM election_ps_postal_mapping m
			JOIN elections e ON e.rs = m.rs AND e.date = m.date AND e.election_type = m.election_type
			JOIN election_result er ON er.rs = m.rs AND er.election_id = e.election_id
				AND er.ps_id IN (m.ps_id, m.ps_id_postal)
			JOIN election_party_family epf ON epf.rs = er.rs AND epf.election_id = er.election_id
				AND epf.party_id = er.party_id AND epf.votetype_id = er.votetype_id
			WHERE m.election_type = ${electionType} AND m.date = ${date}
				AND epf.party_family_id IN (${sql.join(CATCH_ALL_FAMILIES, sql`, `)})
			GROUP BY 1, 2, 3, 4
		)
		SELECT l.ps_id, l.votetype_id, l.party_family_id,
			MAX(l.votes) * MAX(a.vote_percent::float8 / NULLIF(a.vote_count::float8, 0)) AS share
		FROM lists l
		JOIN election_result_aggregate_party_ps a ON a.ps_id = l.ps_id AND a.votetype_id = l.votetype_id
			AND a.party_family_id = l.party_family_id AND a.election_type = ${electionType}
			AND a.date = ${date}
		GROUP BY 1, 2, 3
	`);
	const out = new Map<string, number>();
	for (const r of result as unknown as Record<string, unknown>[])
		if (r.share !== null)
			out.set(`${r.ps_id}:${r.votetype_id}:${r.party_family_id}`, Number(r.share));
	return out;
}

/**
 * Numeric `election_type` values for the two elections that allocate seats (see `election-types.csv`
 * seed data and the Kartenansicht click-dummy's `seatsHere` condition: Gemeinderatswahl seats are
 * counted at Gemeinde grain, Kreistagswahl seats at Kreis grain).
 */
const GEMEINDERATSWAHL_TYPE = 6;
const KREISTAGSWAHL_TYPE = 5;

export type BreakdownGrain = 'gemeinde' | 'kreis' | 'regierungsbezirk' | 'wahlbezirk' | 'wahlkreis';

export interface RegionBreakdownRow {
	partyName: string | null;
	color: string | null;
	votePercent: number | null;
	/** Raw vote count — lets the client sum multiple regions' rows into a correctly-weighted combined
	 * total (e.g. the Kartenansicht's "Land" scope, whose totals are a client-side sum of the four
	 * Regierungsbezirk rows — see the module doc on `getRegionBreakdowns`). */
	voteCount: number | null;
	seats: number | null;
	/** Bundestag/Landtag Erststimmen only: the party's candidate, where exactly one ran in the area. */
	candidate?: string | null;
}

export interface RegionBreakdown {
	/** rs (gemeinde/kreis/regierungsbezirk), polling-station name slug (wahlbezirk), or districtId
	 * (wahlkreis) — always stringified, matching the map's `keyProperty` convention. */
	key: string;
	turnout: number | null;
	eligible: number | null;
	seatTotal: number | null;
	/** Gemeinde grain only: its postal votes are counted centrally elsewhere and missing here. */
	postalElsewhere?: boolean;
	rows: RegionBreakdownRow[];
}

export interface RegionBreakdownParams {
	grain: BreakdownGrain;
	/** rs list for gemeinde/kreis/regierungsbezirk. Ignored for wahlbezirk/wahlkreis, which — like
	 * `getMapInformationPs`/the Wahlkreis branch of `getMapInformation` — always return every row for
	 * the given election+date rather than being scoped into a parent region. */
	rsList?: number[];
	electionType: number;
	date: string;
	voteType?: '0' | '1';
}

/**
 * Full per-party breakdown (every party, not just the one the current map mode colours by) plus
 * turnout/eligible-voter counts and, where applicable, seats — the data the Kartenansicht redesign's
 * left panel (top 7 rows) and hover card (top 5 rows) need. `getMapInformation`/`getMapInformationPs`
 * intentionally stay as-is (they answer "one value per region for the active colouring mode", which is
 * all the map fill layer needs and is cheaper to compute).
 */
export async function getRegionBreakdowns(
	db: Db,
	params: RegionBreakdownParams
): Promise<RegionBreakdown[]> {
	const breakdowns = await getRegionBreakdownsBase(db, params);
	// Erststimmen of a Bundestags-/Landtagswahl: name the party's candidate wherever only one ran.
	if ((params.electionType !== 2 && params.electionType !== 3) || params.voteType !== '0')
		return breakdowns;
	const candidates = await getErststimmeCandidates(db, params);
	return breakdowns.map((b) => ({
		...b,
		rows: b.rows.map((r) => ({
			...r,
			candidate: (r.partyName && candidates.get(`${b.key}|${r.partyName}`)) || null
		}))
	}));
}

/**
 * "area key|party" → the single Erststimme candidate of that party in that area (absent where
 * several ran, e.g. a Regierungsbezirk, or Stuttgart as a whole with two Wahlkreise). Decided from
 * the per-polling-station `candidate_name` ("Dr. Mustermann, CDU"), since `election_party` keeps
 * only one label per party and Gemeinde. Shown as the full name from that label where it is the
 * same person ("Dr. Max Mustermann"), else as the station label's surname ("Muster-Frau").
 */
async function getErststimmeCandidates(
	db: Db,
	params: RegionBreakdownParams
): Promise<Map<string, string>> {
	const { grain, electionType, date } = params;
	const rsList = params.rsList ?? [];
	const kreisOrRb = (digits: number) => sql.raw(`rpad(substr(er.rs::text, 1, ${digits}), 11, '0')`);
	const area =
		grain === 'gemeinde'
			? sql`er.rs::text`
			: grain === 'kreis'
				? kreisOrRb(4)
				: grain === 'regierungsbezirk'
					? kreisOrRb(2)
					: grain === 'wahlkreis'
						? sql`m.district_id::text`
						: sql`split_part(coalesce(ps.name, ''), ' ', 1)`;
	const join =
		grain === 'wahlkreis'
			? sql`JOIN election_vote_district_mapping m ON m.rs = er.rs AND m.election_type = e.election_type
				AND m.date = e.date AND (m.ps_id IS NULL OR m.ps_id = er.ps_id)`
			: grain === 'wahlbezirk'
				? sql`JOIN polling_stations ps ON ps.rs = er.rs AND ps.ps_id = er.ps_id
					AND ps.election_id = er.election_id`
				: sql``;
	const scope =
		grain === 'wahlkreis'
			? sql``
			: grain === 'wahlbezirk'
				? sql`AND er.rs IN (SELECT rs FROM election_result_aggregate_meta_ps
					WHERE election_type = ${electionType} AND date = ${date})`
				: rsList.length === 0
					? sql`AND false`
					: grain === 'gemeinde' // plain column → uses election_result's rs index
						? sql`AND er.rs IN (${sql.join(rsList, sql`, `)})`
						: sql`AND ${area}::bigint IN (${sql.join(rsList, sql`, `)})`;
	const result = await db.execute(sql`
		SELECT ${area} AS key, p.name_short AS party,
			count(DISTINCT er.candidate_name) AS n,
			min(er.candidate_name) AS label,
			min(CASE WHEN ep.name = er.candidate_name THEN split_part(ep.name_long, ', ', 1) END) AS full_name
		FROM election_result er
		JOIN elections e ON e.election_id = er.election_id AND e.rs = er.rs
		JOIN election_party_family epf ON epf.rs = er.rs AND epf.election_id = er.election_id
			AND epf.party_id = er.party_id AND epf.votetype_id = er.votetype_id
		JOIN party p ON p.party_family_id = epf.party_family_id
		JOIN election_party ep ON ep.rs = er.rs AND ep.election_id = er.election_id
			AND ep.party_id = er.party_id AND ep.votetype_id = er.votetype_id
		${join}
		WHERE e.election_type = ${electionType} AND e.date = ${date} AND er.votetype_id = 0
			AND er.candidate_name LIKE '%, %' ${scope}
		GROUP BY 1, 2
	`);
	const out = new Map<string, string>();
	for (const r of result as unknown as Record<string, unknown>[]) {
		if (Number(r.n) !== 1 || !r.party) continue;
		const label = String(r.label);
		out.set(
			`${r.key}|${r.party}`,
			r.full_name ? String(r.full_name) : label.slice(0, label.lastIndexOf(', '))
		);
	}
	return out;
}

async function getRegionBreakdownsBase(
	db: Db,
	params: RegionBreakdownParams
): Promise<RegionBreakdown[]> {
	const { grain, electionType, date, voteType } = params;
	const votetypeFilter = voteType === undefined ? null : Number(voteType);
	const rsList = params.rsList ?? [];
	if (grain !== 'wahlbezirk' && grain !== 'wahlkreis' && rsList.length === 0) return [];

	if (grain === 'wahlkreis') {
		const metaRows = await db
			.select({
				key: sql<string>`${electionResultAggregateMetaDistrict.districtId}::text`,
				votetypeId: electionResultAggregateMetaDistrict.votetypeId,
				votesEligible: electionResultAggregateMetaDistrict.votesEligible,
				turnout: electionResultAggregateMetaDistrict.turnout
			})
			.from(electionResultAggregateMetaDistrict)
			.where(
				and(
					eq(electionResultAggregateMetaDistrict.electionType, electionType),
					eq(electionResultAggregateMetaDistrict.date, date)
				)
			);
		const partyRows = await db
			.select({
				key: sql<string>`${electionResultAggregatePartyDistrict.districtId}::text`,
				votetypeId: electionResultAggregatePartyDistrict.votetypeId,
				votePercent: electionResultAggregatePartyDistrict.votePercent,
				voteCount: electionResultAggregatePartyDistrict.voteCount,
				color: electionResultAggregatePartyDistrict.color,
				nameShort: party.nameShort
			})
			.from(electionResultAggregatePartyDistrict)
			.innerJoin(party, eq(electionResultAggregatePartyDistrict.partyFamilyId, party.partyFamilyId))
			.where(
				and(
					eq(electionResultAggregatePartyDistrict.electionType, electionType),
					eq(electionResultAggregatePartyDistrict.date, date)
				)
			);
		return assembleBreakdowns(
			metaRows.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter),
			partyRows.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter),
			null
		);
	}

	if (grain === 'wahlbezirk') {
		const metaRows = await db
			.selectDistinct({
				key: sql<string>`split_part(coalesce(${pollingStations.name}, ''), ' ', 1)`,
				votetypeId: electionResultAggregateMetaPs.votetypeId,
				votesEligible: electionResultAggregateMetaPs.votesEligible,
				turnout: electionResultAggregateMetaPs.turnout
			})
			.from(electionResultAggregateMetaPs)
			.innerJoin(
				pollingStations,
				and(
					eq(electionResultAggregateMetaPs.psId, pollingStations.psId),
					eq(electionResultAggregateMetaPs.rs, pollingStations.rs),
					eq(electionResultAggregateMetaPs.date, pollingStations.date)
				)
			)
			.where(
				and(
					eq(electionResultAggregateMetaPs.electionType, electionType),
					eq(electionResultAggregateMetaPs.date, date)
				)
			);
		const partyRows = await db
			.selectDistinct({
				key: sql<string>`split_part(coalesce(${pollingStations.name}, ''), ' ', 1)`,
				votetypeId: electionResultAggregatePartyPs.votetypeId,
				votePercent: electionResultAggregatePartyPs.votePercent,
				voteCount: electionResultAggregatePartyPs.voteCount,
				color: electionResultAggregatePartyPs.color,
				nameShort: party.nameShort
			})
			.from(electionResultAggregatePartyPs)
			.innerJoin(party, eq(electionResultAggregatePartyPs.partyFamilyId, party.partyFamilyId))
			.innerJoin(
				pollingStations,
				and(
					eq(electionResultAggregatePartyPs.psId, pollingStations.psId),
					eq(electionResultAggregatePartyPs.rs, pollingStations.rs),
					eq(electionResultAggregatePartyPs.date, pollingStations.date)
				)
			)
			.where(
				and(
					eq(electionResultAggregatePartyPs.electionType, electionType),
					eq(electionResultAggregatePartyPs.date, date)
				)
			);
		return assembleBreakdowns(
			metaRows.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter),
			partyRows.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter),
			null
		);
	}

	// gemeinde / kreis / regierungsbezirk all share the same region-grain aggregate tables (see
	// getMapInformation's doc comment — a Kreis/Regierungsbezirk row is just a region row whose rs was
	// truncated+padded at scrape time).
	const metaRows = await db
		.select({
			key: sql<string>`${electionResultAggregateMetaRegion.rs}::text`,
			votetypeId: electionResultAggregateMetaRegion.votetypeId,
			votesEligible: electionResultAggregateMetaRegion.votesEligible,
			turnout: electionResultAggregateMetaRegion.turnout
		})
		.from(electionResultAggregateMetaRegion)
		.where(
			and(
				eq(electionResultAggregateMetaRegion.electionType, electionType),
				eq(electionResultAggregateMetaRegion.date, date),
				inArray(electionResultAggregateMetaRegion.rs, rsList)
			)
		);
	const partyRowsRaw = await db
		.select({
			rs: electionResultAggregatePartyRegion.rs,
			key: sql<string>`${electionResultAggregatePartyRegion.rs}::text`,
			votetypeId: electionResultAggregatePartyRegion.votetypeId,
			votePercent: electionResultAggregatePartyRegion.votePercent,
			voteCount: electionResultAggregatePartyRegion.voteCount,
			color: electionResultAggregatePartyRegion.color,
			nameShort: party.nameShort,
			partyFamilyId: electionResultAggregatePartyRegion.partyFamilyId
		})
		.from(electionResultAggregatePartyRegion)
		.innerJoin(party, eq(electionResultAggregatePartyRegion.partyFamilyId, party.partyFamilyId))
		.where(
			and(
				eq(electionResultAggregatePartyRegion.electionType, electionType),
				eq(electionResultAggregatePartyRegion.date, date),
				inArray(electionResultAggregatePartyRegion.rs, rsList)
			)
		);

	const seatsHere =
		(electionType === GEMEINDERATSWAHL_TYPE && grain === 'gemeinde') ||
		(electionType === KREISTAGSWAHL_TYPE && grain === 'kreis');
	const seatCounts = seatsHere ? await getSeatCounts(db, rsList, electionType, date) : null;

	let partyRows = partyRowsRaw
		.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter)
		.map((r) => ({
			...r,
			seats: seatCounts?.byFamily.get(String(r.rs))?.get(r.partyFamilyId) ?? null
		}));

	// A single electoral area — any Gemeinde, or a Kreis in a Kreistagswahl — lists every ballot list
	// that isn't simply one party family under its own name: the local voter groups / small parties
	// behind the catch-all families, and joint lists of several parties (e.g. "Volt/ÖDP", which the
	// family aggregates count once per partner). Bigger scopes keep the family view.
	const splitGrain =
		grain === 'gemeinde' || (grain === 'kreis' && electionType === KREISTAGSWAHL_TYPE)
			? grain
			: null;
	// ponytail: per-list seats are only resolvable per Gemeinde (party_ids differ across a Kreis); no
	// Kreistag seats are crawled yet, so a Kreis with seat data just keeps the family view for now.
	const kreisHasSeats = splitGrain === 'kreis' && (seatCounts?.byParty.size ?? 0) > 0;
	if (splitGrain && !kreisHasSeats) {
		// Bundestag/Landtag: every party has its own family, so "Sonstige" holds only independent
		// Erststimme candidates — kept as one row, which the client labels "Einzelbewerber:in / Name"
		// where it's a single person (see getErststimmeCandidates), like at Wahlkreis grain.
		const independentsOnly = (l: SplitList) =>
			(electionType === 2 || electionType === 3) && l.families.every((f) => f === SONSTIGE_FAMILY);
		const lists = (await getSplitLists(db, rsList, splitGrain, electionType, date)).filter(
			(l) => (votetypeFilter === null || l.votetypeId === votetypeFilter) && !independentsOnly(l)
		);
		if (lists.length > 0)
			partyRows = splitLists(partyRows, lists, seatsHere ? (seatCounts?.byParty ?? null) : null);
	}

	const breakdowns = assembleBreakdowns(
		metaRows.filter((r) => votetypeFilter === null || r.votetypeId === votetypeFilter),
		partyRows,
		// Every requested rs counts as "seats apply here" once the election/grain combo allocates seats
		// at all — not just the ones a candidate happened to be found for — so a region with genuinely
		// zero recorded winners still reports `seatTotal: 0` rather than `null` (see doc comment below).
		seatsHere ? new Set(rsList.map(String)) : null
	);
	if (grain !== 'gemeinde') return breakdowns;
	// Gemeinden imported from Kreis open data whose postal votes are counted elsewhere (kreisOpenData.ts).
	const postal = await postalElsewhereRs(db, rsList, electionType, date);
	return breakdowns.map((b) => ({ ...b, postalElsewhere: postal.has(Number(b.key)) }));
}

/** Catch-all party families (see partyFamily.ts): aggregated as one group, but listed by their real
 * names wherever a breakdown covers a single electoral area. */
const SONSTIGE_FAMILY = 91;
const CATCH_ALL_FAMILIES = [90, SONSTIGE_FAMILY];
/** Distinct muted tones for individual local lists, so they stay apart in the seat chart. */
const LOCAL_LIST_COLORS = ['#8c7355', '#c2a67a', '#5f5140', '#d8c9ae', '#a8906e', '#77664f'];

interface SplitList {
	rs: number;
	votetypeId: number;
	/** Every family the list is counted for — several for a joint list. */
	families: number[];
	/** The list's party_id — only meaningful per Gemeinde (a Kreis groups several). */
	partyId: number;
	name: string;
	voteCount: number;
}

/**
 * Ballot lists that don't map onto exactly one real party family — catch-all lists and joint lists —
 * per Gemeinde (or per Kreis for a Kreistagswahl), summed over polling stations exactly like
 * `insertPartyRegionAggregate`. Within one Gemeinde a list is one party_id (election_party holds one
 * label per party_id/votetype); across a Kreis every Gemeinde has its own party_ids, so lists are
 * grouped by label there.
 */
async function getSplitLists(
	db: Db,
	rsList: number[],
	grain: 'gemeinde' | 'kreis',
	electionType: number,
	date: string
): Promise<SplitList[]> {
	const rsOf = (alias: string) =>
		grain === 'kreis'
			? sql.raw(`rpad(substr(${alias}.rs::text, 1, 4), 11, '0')::bigint`)
			: sql.raw(`${alias}.rs`);
	const listKey = grain === 'kreis' ? sql`ep.name` : sql`er.party_id`;
	const result = await db.execute(sql`
		WITH fam AS (
			SELECT epf.rs, epf.election_id, epf.party_id, epf.votetype_id,
				array_agg(DISTINCT epf.party_family_id ORDER BY epf.party_family_id) AS families
			FROM election_party_family epf
			JOIN elections e ON e.election_id = epf.election_id AND e.rs = epf.rs
			WHERE e.election_type = ${electionType} AND e.date = ${date}
				AND ${rsOf('epf')} IN (${sql.join(rsList, sql`, `)})
			GROUP BY 1, 2, 3, 4
			HAVING count(DISTINCT epf.party_family_id) > 1
				OR bool_or(epf.party_family_id IN (${sql.join(CATCH_ALL_FAMILIES, sql`, `)}))
		)
		SELECT ${rsOf('er')} AS rs, er.votetype_id, fam.families, min(er.party_id) AS party_id,
			min(ep.name) AS name, SUM(er.vote_count)::float8 AS vote_count
		FROM fam
		JOIN election_result er ON er.rs = fam.rs AND er.election_id = fam.election_id
			AND er.party_id = fam.party_id AND er.votetype_id = fam.votetype_id
		JOIN election_party ep ON ep.rs = fam.rs AND ep.election_id = fam.election_id
			AND ep.party_id = fam.party_id AND ep.votetype_id = fam.votetype_id
		GROUP BY 1, 2, 3, ${listKey}
	`);
	return (result as unknown as Record<string, unknown>[]).map((r) => ({
		rs: Number(r.rs),
		votetypeId: Number(r.votetype_id),
		families: (r.families as (number | string)[]).map(Number),
		partyId: Number(r.party_id),
		name: String(r.name),
		voteCount: Number(r.vote_count)
	}));
}

/**
 * Takes each list out of the family rows it was aggregated into and adds it as a row of its own:
 * votes are subtracted from every family the list counts for (a family left with nothing — e.g.
 * "Wählervereinigungen", or Volt where it only ran jointly — disappears), shares follow from votes
 * with the area's own denominator (share ÷ votes is the same for every row of one area), seats come
 * per party_id (`seatsByParty`: rs → party_id → seats; getSeatCounts leaves these lists out of the
 * family seats). Joint lists get their partners' colours mixed, local lists a muted tone each.
 */
function splitLists<
	T extends {
		rs: number;
		votetypeId: number;
		partyFamilyId: number;
		votePercent: string | null;
		voteCount: number | null;
		nameShort: string | null;
		color: string | null;
		seats: number | null;
	}
>(
	rows: T[],
	lists: SplitList[],
	seatsByParty: Map<string, Map<number, number>> | null,
	/** Map colouring: a local list keeps its catch-all family's name and colour ("Wählervereinigungen"),
	 * so the legend gets one entry instead of every local list's name. */
	familyLookForLocalLists = false
): T[] {
	const out = rows.map((r) => ({ ...r }));
	const reduced = new Set<T>();
	// Rows of the lists themselves, kept apart so a later list never mistakes one for a family row.
	const added: T[] = [];
	const inArea = (r: T, l: SplitList) => r.rs === l.rs && r.votetypeId === l.votetypeId;
	// share ÷ votes per area, taken from the untouched family rows.
	const pctPerVoteByArea = new Map<string, number>();
	for (const r of rows)
		if (r.voteCount && r.votePercent !== null)
			pctPerVoteByArea.set(`${r.rs}:${r.votetypeId}`, Number(r.votePercent) / r.voteCount);
	const localIndex = new Map<string, number>();
	for (const l of [...lists].sort((a, b) => b.voteCount - a.voteCount)) {
		const areaRows = out.filter((r) => inArea(r, l));
		const partners = areaRows.filter((r) => l.families.includes(r.partyFamilyId));
		const template = partners[0] ?? areaRows[0];
		if (!template) continue;
		const pctPerVote = pctPerVoteByArea.get(`${l.rs}:${l.votetypeId}`) ?? null;
		for (const r of partners) {
			reduced.add(r);
			r.voteCount = (r.voteCount ?? 0) - l.voteCount;
			r.votePercent = pctPerVote === null ? null : String(r.voteCount * pctPerVote);
		}
		const realPartners = partners.filter((r) => !CATCH_ALL_FAMILIES.includes(r.partyFamilyId));
		const areaKey = `${l.rs}:${l.votetypeId}`;
		const i = localIndex.get(areaKey) ?? 0;
		if (realPartners.length === 0) localIndex.set(areaKey, i + 1);
		const keepFamilyLook = familyLookForLocalLists && realPartners.length === 0;
		added.push({
			...template,
			nameShort: keepFamilyLook ? template.nameShort : l.name,
			color: keepFamilyLook
				? template.color
				: realPartners.length > 0
					? mixColors(realPartners.map((r) => r.color).filter((c): c is string => !!c))
					: LOCAL_LIST_COLORS[i % LOCAL_LIST_COLORS.length],
			voteCount: l.voteCount,
			votePercent: pctPerVote === null ? null : String(l.voteCount * pctPerVote),
			// Like a family without seats (absent from getSeatCounts): no seat number rather than 0.
			seats: seatsByParty ? (seatsByParty.get(String(l.rs))?.get(l.partyId) ?? null) : null
		});
	}
	// Drop what's left of a family that only contained split lists (half a vote of float slack).
	return [...out.filter((r) => !reduced.has(r) || (r.voteCount ?? 0) > 0.5), ...added];
}

/**
 * Splits catch-all and joint lists out of region-grain family rows (see `splitLists`) so the map's
 * "Stärkste Partei"/"2. Stärkste Partei" rank actual ballot lists. Independent Bundestag/Landtag
 * Erststimme candidates stay one "Sonstige" row, as in the panel.
 */
async function splitForRanking<
	T extends {
		rs: number;
		votetypeId: number;
		partyFamilyId: number;
		votePercent: string | null;
		voteCount: number | null;
		nameShort: string | null;
		color: string | null;
	}
>(db: Db, rows: T[], grain: 'gemeinde' | 'kreis', electionType: number, date: string) {
	const rsList = [...new Set(rows.map((r) => r.rs))];
	if (rsList.length === 0) return rows;
	const independentsOnly = (l: SplitList) =>
		(electionType === 2 || electionType === 3) && l.families.every((f) => f === SONSTIGE_FAMILY);
	const lists = (await getSplitLists(db, rsList, grain, electionType, date)).filter(
		(l) => !independentsOnly(l)
	);
	if (lists.length === 0) return rows;
	return splitLists(
		rows.map((r) => ({ ...r, seats: null })),
		lists,
		null,
		true
	);
}

interface KeyedMetaRow {
	key: string;
	votesEligible: string | null;
	turnout: string | null;
}
interface KeyedPartyRow {
	key: string;
	votePercent: string | null;
	voteCount: number | null;
	color: string | null;
	nameShort: string | null;
	seats?: number | null;
}

/** Shared assembly step for `getRegionBreakdowns`'s five grains: join already-keyed meta+party rows
 * (each query above maps its own columns down to this common `{key, ...}` shape) into one
 * `RegionBreakdown` per key, sorted by vote share. `keysWithSeatTotal` marks which regions the current
 * election/grain combo allocates seats for at all (so a region with zero recorded winners still reports
 * `seatTotal: 0`, not `null`), distinct from an individual row's `seats` simply being absent. */
function assembleBreakdowns(
	metaRows: KeyedMetaRow[],
	partyRows: KeyedPartyRow[],
	keysWithSeatTotal: Set<string> | null
): RegionBreakdown[] {
	const metaByKey = new Map<string, KeyedMetaRow>();
	for (const row of metaRows) metaByKey.set(row.key, row);

	const rowsByKey = new Map<string, RegionBreakdownRow[]>();
	for (const row of partyRows) {
		const list = rowsByKey.get(row.key) ?? [];
		list.push({
			partyName: row.nameShort,
			color: row.color,
			votePercent: row.votePercent === null ? null : Number(row.votePercent) * 100,
			voteCount: row.voteCount,
			seats: row.seats ?? null
		});
		rowsByKey.set(row.key, list);
	}

	const keys = new Set([...metaByKey.keys(), ...rowsByKey.keys()]);
	return Array.from(keys, (key) => {
		const meta = metaByKey.get(key);
		const rows = (rowsByKey.get(key) ?? []).sort(
			(a, b) => (b.votePercent ?? -Infinity) - (a.votePercent ?? -Infinity)
		);
		const seatTotal = rows.reduce((sum, r) => sum + (r.seats ?? 0), 0);
		return {
			key,
			turnout:
				meta?.turnout === null || meta?.turnout === undefined ? null : Number(meta.turnout) * 100,
			eligible:
				meta?.votesEligible === null || meta?.votesEligible === undefined
					? null
					: Number(meta.votesEligible),
			seatTotal: keysWithSeatTotal?.has(key) ? seatTotal : null,
			rows
		};
	});
}

/** Seats won per rs+party-family, from `electionElectedCandidates` — resolved in two round trips (candidate
 * rows, then their party's family) and merged in JS, since `electionElectedCandidates.partyId` only
 * identifies a party within one rs+election (see schema.ts), same as everywhere else this codebase joins
 * across that boundary. */
async function getSeatCounts(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
): Promise<{
	/** rs → party family → seats */
	byFamily: Map<string, Map<number, number>>;
	/** rs → party_id → seats (splits the catch-all families into their lists, see splitCatchAll) */
	byParty: Map<string, Map<number, number>>;
}> {
	const candidates = await db
		.select({
			rs: electionElectedCandidates.rs,
			electionId: electionElectedCandidates.electionId,
			partyId: electionElectedCandidates.partyId
		})
		.from(electionElectedCandidates)
		.where(
			and(
				eq(electionElectedCandidates.electionType, electionType),
				eq(electionElectedCandidates.date, date),
				inArray(electionElectedCandidates.rs, rsList)
			)
		);
	if (candidates.length === 0) return { byFamily: new Map(), byParty: new Map() };

	const families = await db
		.selectDistinct({
			rs: electionPartyFamily.rs,
			electionId: electionPartyFamily.electionId,
			partyId: electionPartyFamily.partyId,
			partyFamilyId: electionPartyFamily.partyFamilyId
		})
		.from(electionPartyFamily)
		.where(inArray(electionPartyFamily.rs, rsList));
	const familiesByKey = new Map<string, number[]>();
	for (const f of families) {
		const key = `${f.rs}:${f.electionId}:${f.partyId}`;
		familiesByKey.set(key, [...(familiesByKey.get(key) ?? []), f.partyFamilyId]);
	}

	const byFamily = new Map<string, Map<number, number>>();
	const byParty = new Map<string, Map<number, number>>();
	const bump = (map: Map<string, Map<number, number>>, rs: number, id: number) => {
		const inner = map.get(String(rs)) ?? new Map<number, number>();
		inner.set(id, (inner.get(id) ?? 0) + 1);
		map.set(String(rs), inner);
	};
	for (const c of candidates) {
		if (c.partyId === null) continue;
		bump(byParty, c.rs, c.partyId);
		// A joint list's seats belong to the list itself (shown as its own row, see splitLists), not
		// to any one partner family.
		const families = familiesByKey.get(`${c.rs}:${c.electionId}:${c.partyId}`) ?? [];
		if (families.length === 1) bump(byFamily, c.rs, families[0]);
	}
	return { byFamily, byParty };
}

/** Cities with more than one Wahlkreis need per-polling-station district resolution (see aggregates());
 * for everything else, one lookup by rs is enough. Used to build the rs -> districtId map the map view
 * needs to know which Wahlkreis a clicked Gemeinde/Kreis belongs to when drilling down. */
export async function getVoteDistrictLookup(db: Db, electionTypeId: number, date: string) {
	return db
		.select()
		.from(electionVoteDistrictMapping)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, electionTypeId),
				eq(electionVoteDistrictMapping.date, date)
			)
		);
}

export interface CandidateResult {
	name: string;
	votes: number;
	elected: boolean;
}

/** "Mustermann, Max" (elected-members table) and "Dr. Max Mustermann" (results) → same key. */
function nameKey(name: string): string {
	return name
		.toLowerCase()
		.split(/[\s,]+/)
		.filter((t) => t && !/^(dr|prof|dipl|ing)\.?$/.test(t) && !t.endsWith('.'))
		.sort()
		.join(' ');
}

/**
 * Every candidate of one ballot list in one Gemeinde (Gemeinderats-/Kreistagswahl), with their votes
 * there and whether they won a seat. `party` is the panel row's label: a list's own name (split
 * local/joint lists, see `splitLists`) or a real party family's short name. `station` narrows it to one
 * Stuttgart Wahlbezirk (AWBEZ_T), urn votes plus its mapped postal district's.
 */
export async function getCandidateResults(
	db: Db,
	params: { electionType: number; date: string; rs: number; party: string; station?: string }
): Promise<CandidateResult[]> {
	const { electionType, date, rs, party, station } = params;
	const stationFilter = station
		? sql`AND er.ps_id IN (
				SELECT m.ps_id FROM election_ps_postal_mapping m
				JOIN polling_stations p ON p.ps_id = m.ps_id AND p.rs = m.rs AND p.date = m.date
				WHERE m.rs = ${rs} AND m.date = ${date} AND m.election_type = ${electionType}
					AND p.election_id = el.election_id AND split_part(p.name, ' ', 1) = ${station}
				UNION
				SELECT m.ps_id_postal FROM election_ps_postal_mapping m
				JOIN polling_stations p ON p.ps_id = m.ps_id AND p.rs = m.rs AND p.date = m.date
				WHERE m.rs = ${rs} AND m.date = ${date} AND m.election_type = ${electionType}
					AND p.election_id = el.election_id AND split_part(p.name, ' ', 1) = ${station}
			)`
		: sql``;
	const rows = (await db.execute(sql`
		WITH el AS (
			SELECT election_id, rs FROM elections
			WHERE rs = ${rs} AND election_type = ${electionType} AND date = ${date}
		),
		fams AS (
			SELECT epf.election_id, epf.party_id, epf.votetype_id,
				array_agg(DISTINCT epf.party_family_id) AS fams
			FROM election_party_family epf JOIN el ON el.election_id = epf.election_id AND el.rs = epf.rs
			GROUP BY 1, 2, 3
		)
		SELECT er.party_id, er.candidate_name AS name, SUM(er.vote_count)::float8 AS votes
		FROM election_result er
		JOIN el ON el.election_id = er.election_id AND el.rs = er.rs
		JOIN election_party ep ON ep.rs = er.rs AND ep.election_id = er.election_id
			AND ep.party_id = er.party_id AND ep.votetype_id = er.votetype_id
		LEFT JOIN fams f ON f.election_id = er.election_id AND f.party_id = er.party_id
			AND f.votetype_id = er.votetype_id
		WHERE er.candidate_name <> '' ${stationFilter}
			AND (ep.name = ${party} OR (
				cardinality(f.fams) = 1
				AND NOT f.fams[1] = ANY(${sql.raw(`ARRAY[${CATCH_ALL_FAMILIES.join(',')}]`)})
				AND EXISTS (SELECT 1 FROM party p WHERE p.party_family_id = f.fams[1] AND p.name_short = ${party})
			))
		GROUP BY 1, 2
		ORDER BY 3 DESC, 2
	`)) as unknown as { party_id: number; name: string; votes: number }[];
	if (rows.length === 0) return [];

	const elected = await db
		.select({ partyId: electionElectedCandidates.partyId, name: electionElectedCandidates.name })
		.from(electionElectedCandidates)
		.where(
			and(
				eq(electionElectedCandidates.rs, rs),
				eq(electionElectedCandidates.electionType, electionType),
				eq(electionElectedCandidates.date, date)
			)
		);
	const electedKeys = new Set(elected.map((e) => `${e.partyId}:${nameKey(e.name)}`));
	return rows.map((r) => ({
		name: r.name,
		votes: Number(r.votes),
		elected: electedKeys.has(`${r.party_id}:${nameKey(r.name)}`)
	}));
}
