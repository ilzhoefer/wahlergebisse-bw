/**
 * Everything the Gemeinde page (/gemeinde/[rs]) shows: per election type, the party-family trend
 * across dates (from the precomputed aggregates), turnout, and the latest election's full breakdown
 * (lists split by name, seats) — plus the current Gemeinderat. Memoized until the next crawl.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '#lib/server/db/index.ts';
import {
	cities,
	electionElectedCandidates,
	electionParty,
	electionResultAggregateMetaRegion,
	electionResultAggregatePartyRegion,
	electionType,
	party
} from '#lib/server/db/schema.ts';
import { getRegionBreakdowns, type RegionBreakdown } from '#lib/server/map/queries.ts';
import { memo } from '#lib/server/queryCache.ts';
import { rsPrefix } from '#lib/map/rs.ts';
import { shortCityName } from '#lib/server/map/shareMeta.ts';
import { WAEHLERVEREINIGUNGEN_FAMILY } from '#lib/server/scraper/partyFamily.ts';
import names from '#lib/server/map/region-names.json';

type Db = typeof DbType;

export interface TrendSeries {
	partyFamilyId: number;
	name: string;
	color: string | null;
	/** Share in % per date of `ElectionHistory.dates` (null where the party didn't run). */
	values: (number | null)[];
}

export interface ElectionHistory {
	electionType: number;
	description: string;
	/** Oldest first. */
	dates: string[];
	turnout: (number | null)[];
	series: TrendSeries[];
	latest: { date: string; voteType: '0' | '1'; breakdown: RegionBreakdown | null };
}

export interface OverallTrend {
	/** Every election here with results, oldest first (same-day elections in TYPE_ORDER). */
	elections: { electionType: number; description: string; date: string }[];
	/** Every party family that reached TREND_MIN_PCT in any of them, highest peak first; `values`
	 * line up with `elections`. */
	series: TrendSeries[];
}

export interface CouncilMember {
	name: string;
	list: string | null;
}

export interface GemeindePage {
	rs: number;
	name: string;
	officialName: string;
	population: number | null;
	kreis: string | null;
	regierungsbezirk: string | null;
	elections: ElectionHistory[];
	/** All elections on one time axis, for the page's "Entwicklung über alle Wahlen". */
	overall: OverallTrend;
	council: { date: string; members: CouncilMember[] } | null;
}

/** Local elections first, then up to Europe — the order people look for them in. */
const TYPE_ORDER = [6, 7, 8, 5, 4, 3, 2, 1, 9, 10];
/** A party appears in the trend once it reached this share in any election here. */
const TREND_MIN_PCT = 3;
const TREND_MAX_SERIES = 8;
const peak = (s: TrendSeries) => Math.max(...s.values.map((v) => v ?? 0));

export function getGemeindePage(db: Db, rs: number): Promise<GemeindePage | null> {
	return memo('gemeindePage', rs, () => load(db, rs));
}

async function load(db: Db, rs: number): Promise<GemeindePage | null> {
	const [city] = await db.select().from(cities).where(eq(cities.rs, rs));
	if (!city) return null;

	const p = electionResultAggregatePartyRegion;
	const meta = electionResultAggregateMetaRegion;
	const [partyRows, metaRows, types] = await Promise.all([
		db
			.select({
				electionType: p.electionType,
				date: p.date,
				votetypeId: p.votetypeId,
				partyFamilyId: p.partyFamilyId,
				name: party.nameShort,
				color: sql<string | null>`coalesce(${p.color}, ${party.color})`,
				votePercent: p.votePercent
			})
			.from(p)
			.innerJoin(party, eq(party.partyFamilyId, p.partyFamilyId))
			.where(eq(p.rs, rs)),
		db
			.select({
				electionType: meta.electionType,
				date: meta.date,
				votetypeId: meta.votetypeId,
				turnout: meta.turnout
			})
			.from(meta)
			.where(eq(meta.rs, rs)),
		db.select().from(electionType)
	]);

	// The list vote is the highest votetype of an election: Zweitstimme where there are two, the
	// single vote otherwise — so a Landtagswahl 2021 (one vote) lines up with 2026's Zweitstimme.
	const listVote = new Map<string, number>();
	for (const r of metaRows) {
		const k = `${r.electionType}|${r.date}`;
		listVote.set(k, Math.max(listVote.get(k) ?? 0, r.votetypeId));
	}
	const isListVote = (r: { electionType: number; date: string; votetypeId: number }) =>
		listVote.get(`${r.electionType}|${r.date}`) === r.votetypeId;

	const description = (typeId: number) =>
		types.find((t) => t.electionType === typeId)?.electionDescription ?? '';

	const elections: ElectionHistory[] = [];
	for (const typeId of [...new Set(metaRows.map((r) => r.electionType))].sort(
		(a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
	)) {
		const dates = [
			...new Set(metaRows.filter((r) => r.electionType === typeId).map((r) => r.date))
		].sort();
		const turnout = dates.map((d) => {
			const row = metaRows.find((r) => r.electionType === typeId && r.date === d && isListVote(r));
			return row?.turnout == null ? null : Number(row.turnout) * 100; // stored as a fraction
		});

		const byFamily = new Map<number, TrendSeries>();
		for (const r of partyRows) {
			if (r.electionType !== typeId || !isListVote(r) || r.votePercent == null) continue;
			const s = byFamily.get(r.partyFamilyId) ?? {
				partyFamilyId: r.partyFamilyId,
				name: r.name ?? '?',
				color: r.color,
				values: dates.map(() => null)
			};
			s.values[dates.indexOf(r.date)] = Number(r.votePercent) * 100; // stored as a fraction
			byFamily.set(r.partyFamilyId, s);
		}
		const series = [...byFamily.values()]
			.filter((s) => peak(s) >= TREND_MIN_PCT)
			.sort((a, b) => (b.values.at(-1) ?? -1) - (a.values.at(-1) ?? -1) || peak(b) - peak(a))
			.slice(0, TREND_MAX_SERIES);

		const date = dates.at(-1)!;
		const voteType = String(listVote.get(`${typeId}|${date}`) ?? 0) as '0' | '1';
		const [breakdown] = await getRegionBreakdowns(db, {
			grain: 'gemeinde',
			rsList: [rs],
			electionType: typeId,
			date,
			voteType
		});
		elections.push({
			electionType: typeId,
			description: description(typeId),
			dates,
			turnout,
			series,
			latest: { date, voteType, breakdown: breakdown ?? null }
		});
	}

	return {
		rs,
		overall: overallTrend(metaRows.filter(isListVote), partyRows.filter(isListVote), description),
		name: shortCityName(city.name ?? String(rs)),
		officialName: city.name ?? String(rs),
		population: city.population,
		kreis: regionName(Number(rsPrefix(rs, 4).padEnd(11, '0'))),
		regierungsbezirk: regionName(Number(rsPrefix(rs, 2).padEnd(11, '0'))),
		elections,
		council: await getCouncil(db, rs)
	};
}

function overallTrend(
	metaRows: { electionType: number; date: string }[],
	partyRows: {
		electionType: number;
		date: string;
		partyFamilyId: number;
		name: string | null;
		color: string | null;
		votePercent: string | number | null;
	}[],
	description: (typeId: number) => string
): OverallTrend {
	const key = (r: { electionType: number; date: string }) => `${r.electionType}|${r.date}`;
	const elections = [...new Map(metaRows.map((r) => [key(r), r])).values()]
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				TYPE_ORDER.indexOf(a.electionType) - TYPE_ORDER.indexOf(b.electionType)
		)
		.map((r) => ({
			electionType: r.electionType,
			description: description(r.electionType),
			date: r.date
		}));
	const index = new Map(elections.map((e, i) => [key(e), i]));

	const byFamily = new Map<number, TrendSeries>();
	for (const r of partyRows) {
		const i = index.get(key(r));
		// A catch-all of unrelated local lists — a line through it across elections means nothing.
		if (i === undefined || r.votePercent == null || r.partyFamilyId === WAEHLERVEREINIGUNGEN_FAMILY)
			continue;
		const s = byFamily.get(r.partyFamilyId) ?? {
			partyFamilyId: r.partyFamilyId,
			name: r.name ?? '?',
			color: r.color,
			values: elections.map(() => null)
		};
		s.values[i] = Number(r.votePercent) * 100; // stored as a fraction
		byFamily.set(r.partyFamilyId, s);
	}
	const series = [...byFamily.values()]
		.filter((s) => peak(s) >= TREND_MIN_PCT)
		.sort((a, b) => peak(b) - peak(a));
	return { elections, series };
}

function regionName(rs: number): string | null {
	return (names.regions as Record<string, string>)[String(rs)] ?? null;
}

/** Members of the most recent Gemeinderat on record, with the list they were elected on. */
async function getCouncil(db: Db, rs: number): Promise<GemeindePage['council']> {
	const c = electionElectedCandidates;
	const [latest] = await db
		.select({ date: c.date })
		.from(c)
		.where(and(eq(c.rs, rs), eq(c.electionType, 6)))
		.orderBy(sql`${c.date} desc`)
		.limit(1);
	if (!latest) return null;
	const members = await db
		.select({
			name: c.name,
			list: sql<string | null>`(select ${electionParty.name} from ${electionParty}
				where ${electionParty.rs} = ${c.rs} and ${electionParty.electionId} = ${c.electionId}
				and ${electionParty.partyId} = ${c.partyId} limit 1)`
		})
		.from(c)
		.where(and(eq(c.rs, rs), eq(c.electionType, 6), eq(c.date, latest.date)))
		.orderBy(asc(c.name));
	return { date: latest.date, members };
}
