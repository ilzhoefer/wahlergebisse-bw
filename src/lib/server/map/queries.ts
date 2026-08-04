import { and, desc, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
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
	'Stärkste Partei' | '2. Stärkste Partei' | 'Wahlbeteiligung' | 'Hochburg';

export interface MapInformationParams {
	selectedMapInformation: MapInformationMode;
	selectedMapMode: MapMode;
	selectedElectionType: number;
	selectedDate: string;
	selectedParty?: string;
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
		selectedParty
	} = params;
	const isDistrict = selectedMapMode === 'Wahlkreis';

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
							eq(electionResultAggregateMetaRegion.date, selectedDate)
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
					nameShort: party.nameShort
				})
				.from(electionResultAggregatePartyRegion)
				.innerJoin(party, eq(electionResultAggregatePartyRegion.partyFamilyId, party.partyFamilyId))
				.where(
					and(
						eq(electionResultAggregatePartyRegion.electionType, selectedElectionType),
						eq(electionResultAggregatePartyRegion.date, selectedDate)
					)
				);

	const regionKeyOf = (r: (typeof raw)[number]) => ('districtId' in r ? r.districtId : r.rs);
	const groupKey = (r: (typeof raw)[number]) => `${regionKeyOf(r)}-${r.votetypeId}`;
	const valueOf = (r: (typeof raw)[number]) =>
		r.votePercent === null ? null : Number(r.votePercent);

	if (selectedMapInformation === 'Stärkste Partei')
		return sliceMaxByGroup(raw, groupKey, valueOf, 1);
	if (selectedMapInformation === '2. Stärkste Partei')
		return secondPlaceByGroup(raw, groupKey, valueOf);
	// Hochburg
	return raw.filter((r) => r.nameShort === selectedParty);
}

/**
 * Port of shiny_map_information_ps: polling-station grain, currently only meaningfully populated for
 * Stuttgart (see electionResultAggregatePartyPs/MetaPs table comments).
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

	if (selectedMapInformation === 'Stärkste Partei')
		return sliceMaxByGroup(raw, groupKey, valueOf, 1);
	if (selectedMapInformation === '2. Stärkste Partei')
		return secondPlaceByGroup(raw, groupKey, valueOf);
	return raw.filter((r) => r.nameShort === selectedParty);
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
