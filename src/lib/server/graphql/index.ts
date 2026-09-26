import { rumble } from '@m1212e/rumble';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import {
	getElectionTypes,
	getAllElectionDates,
	getParties,
	getMapInformation,
	getMapInformationPs,
	getRegionBreakdowns,
	getGemeindenWithData,
	possibleMapModes,
	searchCandidates,
	getCandidateResults,
	type CandidateHit,
	type CandidateResult,
	type MapMode,
	type MapInformationMode,
	type BreakdownGrain,
	type RegionBreakdown
} from '$lib/server/map/queries';
import { memo } from '$lib/server/queryCache';
import {
	getWahlkreisGemeinden,
	getWahlkreisMandates,
	getWahlkreisBezirke,
	type WahlkreisMandates
} from '$lib/server/map/mandates';
import { turnoutColorScale, partyColorScale, diffColorScale } from '$lib/map/colors';

/*
 * Phase 1/2 data (map view, CSV export) is fully public — no abilities are defined here, and these
 * query fields are plain custom resolvers wrapping the existing hand-written Drizzle query functions
 * from src/lib/server/map/, not rumble's auto object()/query() CRUD helpers. Abilities (and rumble's
 * auto helpers) become relevant starting with Phase 3's admin-only crawl trigger.
 */
export const { schemaBuilder, createYoga, clientCreator } = rumble({
	db,
	schema,
	context: () => ({})
});

const ElectionTypeOptionRef = schemaBuilder
	.objectRef<{ electionType: number; electionDescription: string | null }>('ElectionTypeOption')
	.implement({
		fields: (t) => ({
			electionType: t.exposeInt('electionType'),
			electionDescription: t.exposeString('electionDescription', { nullable: true })
		})
	});

const ElectionDateRef = schemaBuilder
	.objectRef<{ electionType: number | null; date: string | null }>('ElectionDate')
	.implement({
		fields: (t) => ({
			electionType: t.exposeInt('electionType', { nullable: true }),
			date: t.exposeString('date', { nullable: true })
		})
	});

const MapModesRef = schemaBuilder
	.objectRef<{ possibleModes: MapMode[]; selectedMode: MapMode }>('MapModes')
	.implement({
		fields: (t) => ({
			possibleModes: t.stringList({ resolve: (parent) => parent.possibleModes }),
			selectedMode: t.exposeString('selectedMode')
		})
	});

const PartyOptionRef = schemaBuilder
	.objectRef<{ nameShort: string | null; partyFamilyId: number }>('PartyOption')
	.implement({
		fields: (t) => ({
			nameShort: t.exposeString('nameShort', { nullable: true }),
			partyFamilyId: t.exposeInt('partyFamilyId')
		})
	});

const CandidateHitRef = schemaBuilder.objectRef<CandidateHit>('CandidateHit').implement({
	fields: (t) => ({
		name: t.exposeString('name'),
		party: t.exposeString('party', { nullable: true }),
		// String: rs overflows GraphQL's 32-bit Int (see regionData's `rs` arg).
		rs: t.string({ resolve: (parent) => String(parent.rs) }),
		electionType: t.exposeInt('electionType'),
		date: t.exposeString('date')
	})
});

// Wrapped in an object (rather than a bare `[String]` query return) to match every other list field in
// this schema — rumble's typed client doesn't handle a top-level scalar-array query field well (its
// field-selection type assumes a query's array elements are always an object to select fields from).
const EligibleGemeindenRef = schemaBuilder
	.objectRef<{ rsList: string[] }>('EligibleGemeinden')
	.implement({
		fields: (t) => ({
			rsList: t.stringList({ resolve: (parent) => parent.rsList })
		})
	});

interface RegionItem {
	key: string;
	color: string | null;
	turnoutPercent?: number | null;
	votePercent?: number | null;
	partyName?: string | null;
	notCompeting?: boolean;
}

const RegionItemRef = schemaBuilder.objectRef<RegionItem>('RegionItem').implement({
	fields: (t) => ({
		key: t.exposeString('key'),
		color: t.exposeString('color', { nullable: true }),
		turnoutPercent: t.exposeFloat('turnoutPercent', { nullable: true }),
		votePercent: t.exposeFloat('votePercent', { nullable: true }),
		partyName: t.exposeString('partyName', { nullable: true }),
		notCompeting: t.exposeBoolean('notCompeting', { nullable: true })
	})
});

interface LegendEntry {
	name: string;
	color: string;
}

interface Legend {
	type: 'turnout' | 'party' | 'parties' | 'diff';
	min?: number;
	max?: number;
	partyName?: string;
	color?: string;
	entries?: LegendEntry[];
}

const LegendEntryRef = schemaBuilder.objectRef<LegendEntry>('LegendEntry').implement({
	fields: (t) => ({
		name: t.exposeString('name'),
		color: t.exposeString('color')
	})
});

const LegendRef = schemaBuilder.objectRef<Legend>('Legend').implement({
	fields: (t) => ({
		type: t.exposeString('type'),
		min: t.exposeFloat('min', { nullable: true }),
		max: t.exposeFloat('max', { nullable: true }),
		partyName: t.exposeString('partyName', { nullable: true }),
		color: t.exposeString('color', { nullable: true }),
		entries: t.field({
			type: [LegendEntryRef],
			nullable: true,
			resolve: (parent) => parent.entries
		})
	})
});

interface RegionData {
	keyField: 'rs' | 'ref' | 'awbezT';
	legend: Legend | null;
	items: RegionItem[];
}

const RegionDataRef = schemaBuilder.objectRef<RegionData>('RegionData').implement({
	fields: (t) => ({
		keyField: t.exposeString('keyField'),
		legend: t.field({ type: LegendRef, nullable: true, resolve: (parent) => parent.legend }),
		items: t.field({ type: [RegionItemRef], resolve: (parent) => parent.items })
	})
});

const RegionBreakdownRowRef = schemaBuilder
	.objectRef<RegionBreakdown['rows'][number]>('RegionBreakdownRow')
	.implement({
		fields: (t) => ({
			partyName: t.exposeString('partyName', { nullable: true }),
			color: t.exposeString('color', { nullable: true }),
			votePercent: t.exposeFloat('votePercent', { nullable: true }),
			voteCount: t.exposeInt('voteCount', { nullable: true }),
			seats: t.exposeInt('seats', { nullable: true }),
			candidate: t.exposeString('candidate', { nullable: true })
		})
	});

const MandateDirectRef = schemaBuilder
	.objectRef<NonNullable<WahlkreisMandates['direct']>>('MandateDirect')
	.implement({
		fields: (t) => ({
			name: t.exposeString('name', { nullable: true }),
			party: t.exposeString('party'),
			percent: t.exposeFloat('percent', { nullable: true }),
			seat: t.exposeBoolean('seat')
		})
	});
const MandateListRef = schemaBuilder
	.objectRef<WahlkreisMandates['list'][number]>('MandateList')
	.implement({
		fields: (t) => ({
			name: t.exposeString('name'),
			party: t.exposeString('party'),
			listPlace: t.exposeInt('listPlace', { nullable: true })
		})
	});
const WahlkreisMandatesRef = schemaBuilder
	.objectRef<WahlkreisMandates & { rs: string[]; bezirke: string[] }>('WahlkreisMandates')
	.implement({
		fields: (t) => ({
			districtId: t.exposeString('districtId'),
			direct: t.field({ type: MandateDirectRef, nullable: true, resolve: (p) => p.direct }),
			list: t.field({ type: [MandateListRef], resolve: (p) => p.list }),
			/** The Gemeinden (rs) this Wahlkreis covers — String: rs overflows GraphQL's Int. */
			rs: t.stringList({ resolve: (p) => p.rs }),
			/** Wahlbezirke in it of Gemeinden spanning several Wahlkreise (keyed as on the map). */
			bezirke: t.stringList({ resolve: (p) => p.bezirke })
		})
	});

const CandidateResultRef = schemaBuilder.objectRef<CandidateResult>('CandidateResult').implement({
	fields: (t) => ({
		name: t.exposeString('name'),
		votes: t.exposeFloat('votes'),
		elected: t.exposeBoolean('elected')
	})
});

const RegionBreakdownRef = schemaBuilder.objectRef<RegionBreakdown>('RegionBreakdown').implement({
	fields: (t) => ({
		key: t.exposeString('key'),
		turnout: t.exposeFloat('turnout', { nullable: true }),
		eligible: t.exposeFloat('eligible', { nullable: true }),
		seatTotal: t.exposeInt('seatTotal', { nullable: true }),
		postalElsewhere: t.boolean({ resolve: (parent) => parent.postalElsewhere ?? false }),
		rows: t.field({ type: [RegionBreakdownRowRef], resolve: (parent) => parent.rows })
	})
});

/** Kartenansicht's `mapMode` argument convention (`MapMode`, the map's display-resolution level) maps
 * 1:1 onto `getRegionBreakdowns`' `grain` — same five values, just cased differently. */
function grainOf(mapMode: MapMode): BreakdownGrain {
	switch (mapMode) {
		case 'Regierungsbezirk':
			return 'regierungsbezirk';
		case 'Kreis':
			return 'kreis';
		case 'Gemeinde':
			return 'gemeinde';
		case 'Wahlkreis':
			return 'wahlkreis';
		case 'Wahlbezirk':
			return 'wahlbezirk';
	}
}

schemaBuilder.queryFields((t) => ({
	electionTypes: t.field({
		type: [ElectionTypeOptionRef],
		resolve: async () => {
			const rows = await getElectionTypes(db);
			return rows.filter((r) => r.electionType !== null) as {
				electionType: number;
				electionDescription: string | null;
			}[];
		}
	}),
	allElectionDates: t.field({
		type: [ElectionDateRef],
		resolve: () => getAllElectionDates(db)
	}),
	mapModes: t.field({
		type: MapModesRef,
		args: { electionType: t.arg.int({ required: true }) },
		resolve: (_root, args) => possibleMapModes(args.electionType)
	}),
	parties: t.field({
		type: [PartyOptionRef],
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true })
		},
		resolve: (_root, args) =>
			memo('parties', args, () => getParties(db, args.date, args.electionType))
	}),
	// Not memoized on purpose: every keystroke is a new key and would evict map queries from the
	// FIFO-capped cache (queryCache.ts), while this query itself is cheap (~17k indexed rows).
	// Static per-election files (see mandates.ts), plus each Wahlkreis's Gemeinden.
	wahlkreisMandates: t.field({
		type: [WahlkreisMandatesRef],
		args: {
			date: t.arg.string({ required: true }),
			electionType: t.arg.int({ required: true })
		},
		resolve: async (_root, args) => {
			const [gemeinden, bezirke] = await Promise.all([
				memo('wahlkreisGemeinden', args, () =>
					getWahlkreisGemeinden(db, args.electionType, args.date)
				),
				memo('wahlkreisBezirke', args, () => getWahlkreisBezirke(db, args.electionType, args.date))
			]);
			return getWahlkreisMandates(args.date).map((m) => ({
				...m,
				rs: gemeinden.get(m.districtId) ?? [],
				bezirke: bezirke.get(m.districtId) ?? []
			}));
		}
	}),
	// One list's candidates in one Gemeinde (or Stuttgart Wahlbezirk) — the panel's party-row
	// expansion for Gemeinderats-/Kreistagswahl. rs is String: it overflows GraphQL's 32-bit Int.
	candidateResults: t.field({
		type: [CandidateResultRef],
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true }),
			rs: t.arg.string({ required: true }),
			party: t.arg.string({ required: true }),
			station: t.arg.string()
		},
		resolve: (_root, args) =>
			memo('candidateResults', args, () =>
				getCandidateResults(db, {
					electionType: args.electionType,
					date: args.date,
					rs: Number(args.rs),
					party: args.party,
					station: args.station ?? undefined
				})
			)
	}),
	searchCandidates: t.field({
		type: [CandidateHitRef],
		args: { q: t.arg.string({ required: true }) },
		resolve: (_root, args) =>
			args.q.trim().length < 3 ? [] : searchCandidates(db, args.q.slice(0, 100))
	}),
	// rsList is String, not Int: `rs` values (up to 12 digits) overflow GraphQL's 32-bit Int — mirrors
	// regionBreakdowns'/regionData's own `rs`. Only meaningfully differs from "every Gemeinde" for
	// Regionalwahl (Region Stuttgart only) — see getGemeindenWithData's doc comment.
	eligibleGemeinden: t.field({
		type: EligibleGemeindenRef,
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true })
		},
		resolve: (_root, args) =>
			memo('eligibleGemeinden', args, () =>
				getGemeindenWithData(db, args.electionType, args.date).then((rsList) => ({
					rsList: rsList.map(String)
				}))
			)
	}),
	regionData: t.field({
		type: RegionDataRef,
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true }),
			mapMode: t.arg.string({ required: true }),
			mapInformation: t.arg.string({ required: true }),
			party: t.arg.string({ required: false }),
			voteType: t.arg.string({ required: false }),
			// String, not Int: `rs` values (up to 12 digits) overflow GraphQL's 32-bit Int — mirrors
			// regionBreakdowns' own `rs` arg. Scopes the colour scale's min/max to what's actually
			// rendered right now (see MapInformationParams.selectedRsList's doc comment).
			rs: t.arg.stringList({ required: false })
		},
		resolve: (_root, args) => memo('regionData', args, () => resolveRegionData(args))
	}),
	regionBreakdowns: t.field({
		type: [RegionBreakdownRef],
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true }),
			mapMode: t.arg.string({ required: true }),
			// String, not Int: `rs` values (up to 12 digits) overflow GraphQL's 32-bit Int.
			rs: t.arg.stringList({ required: false }),
			voteType: t.arg.string({ required: false })
		},
		resolve: (_root, args) =>
			memo('regionBreakdowns', args, () =>
				getRegionBreakdowns(db, {
					grain: grainOf(args.mapMode as MapMode),
					rsList: args.rs?.filter((r): r is string => r !== null).map(Number),
					electionType: args.electionType,
					date: args.date,
					voteType: (args.voteType as '0' | '1' | null) ?? undefined
				})
			)
	})
}));

interface RegionDataArgs {
	electionType: number;
	date: string;
	mapMode: string;
	mapInformation: string;
	party?: string | null;
	voteType?: string | null;
	rs?: (string | null)[] | null;
}

async function resolveRegionData(args: RegionDataArgs) {
	const mapMode = args.mapMode as MapMode;
	const mapInformation = args.mapInformation as MapInformationMode;
	const selectedParty = args.party ?? undefined;
	const selectedRsList = args.rs?.filter((r): r is string => r !== null).map(Number);
	const votetypeFilter =
		(args.electionType === 2 || args.electionType === 3) &&
		args.voteType !== null &&
		args.voteType !== undefined
			? Number(args.voteType)
			: null;

	if (mapMode === 'Wahlbezirk') {
		const rows = await getMapInformationPs(db, {
			selectedMapInformation: mapInformation,
			selectedElectionType: args.electionType,
			selectedDate: args.date,
			selectedParty
		});
		const filtered =
			votetypeFilter === null ? rows : rows.filter((r) => r.votetypeId === votetypeFilter);
		return buildResponse(
			'awbezT',
			mapInformation,
			filtered,
			(r) => r.name?.split(' ')[0] ?? null,
			selectedParty
		);
	}

	const rows = await getMapInformation(db, {
		selectedMapInformation: mapInformation,
		selectedMapMode: mapMode,
		selectedElectionType: args.electionType,
		selectedDate: args.date,
		selectedParty,
		selectedRsList
	});
	const filtered =
		votetypeFilter === null ? rows : rows.filter((r) => r.votetypeId === votetypeFilter);
	const keyField = mapMode === 'Wahlkreis' ? 'ref' : 'rs';
	const keyOf = (r: (typeof filtered)[number]) =>
		'districtId' in r ? String(r.districtId) : 'rs' in r ? String(r.rs) : null;
	return buildResponse(keyField, mapInformation, filtered, keyOf, selectedParty);
}

interface Row {
	turnout?: string | null;
	votePercent?: string | null;
	color?: string | null;
	nameShort?: string | null;
	votetypeId?: number;
}

/**
 * Mirrors the color/legend computation from the REST region-data endpoint (being replaced by this
 * GraphQL query, removed once the client migrates over — see the rumble migration plan).
 */
function buildResponse<T extends Row>(
	keyField: 'rs' | 'ref' | 'awbezT',
	mapInformation: MapInformationMode,
	rows: T[],
	keyOf: (r: T) => string | null,
	selectedParty: string | undefined
): RegionData {
	if (mapInformation === 'Wahlbeteiligung') {
		const values = rows
			.map((r) => (r.turnout === null || r.turnout === undefined ? null : Number(r.turnout) * 100))
			.filter((v): v is number => v !== null);
		const scale = turnoutColorScale(values);
		return {
			keyField,
			legend: values.length
				? { type: 'turnout', min: Math.min(...values), max: Math.max(...values) }
				: null,
			items: rows
				.map((r) => {
					const key = keyOf(r);
					if (key === null) return null;
					const turnoutPercent =
						r.turnout === null || r.turnout === undefined ? null : Number(r.turnout) * 100;
					return {
						key,
						color: turnoutPercent === null ? null : (scale(turnoutPercent) ?? null),
						turnoutPercent
					};
				})
				.filter((r) => r !== null) as RegionItem[]
		};
	}

	if (mapInformation === 'Hochburg') {
		const origColor = rows.find((r) => r.color)?.color ?? '#999999';
		const values = rows
			.map((r) =>
				r.votePercent === null || r.votePercent === undefined ? null : Number(r.votePercent) * 100
			)
			.filter((v): v is number => v !== null);
		const scale = partyColorScale(values, origColor);
		return {
			keyField,
			legend: values.length
				? {
						type: 'party',
						partyName: selectedParty ?? '',
						color: origColor,
						min: Math.min(...values),
						max: Math.max(...values)
					}
				: null,
			items: rows
				.map((r) => {
					const key = keyOf(r);
					if (key === null) return null;
					const votePercent =
						r.votePercent === null || r.votePercent === undefined
							? null
							: Number(r.votePercent) * 100;
					return {
						key,
						color: votePercent === null ? null : (scale(votePercent) ?? null),
						votePercent,
						partyName: selectedParty ?? null,
						notCompeting: votePercent === null
					};
				})
				.filter((r) => r !== null) as RegionItem[]
		};
	}

	if (mapInformation === 'Stimmensplitting') {
		// votePercent carries Erst − Zweit in points; an area without a direct candidate of this party
		// (no Erststimme row) is notCompeting rather than 0.
		const byKey = new Map<string, { e?: number; z?: number }>();
		for (const r of rows) {
			const key = keyOf(r);
			if (key === null || r.votePercent == null) continue;
			const pair = byKey.get(key) ?? {};
			if (r.votetypeId === 0) pair.e = Number(r.votePercent) * 100;
			if (r.votetypeId === 1) pair.z = Number(r.votePercent) * 100;
			byKey.set(key, pair);
		}
		const diffs = Array.from(byKey, ([key, { e, z }]) => ({
			key,
			diff: e !== undefined && z !== undefined ? e - z : null
		}));
		const values = diffs.map((d) => d.diff).filter((v): v is number => v !== null);
		const scale = diffColorScale(values);
		const bound = Math.max(0, ...values.map(Math.abs));
		return {
			keyField,
			legend: values.length
				? { type: 'diff', partyName: selectedParty ?? '', min: -bound, max: bound }
				: null,
			items: diffs.map(({ key, diff }) => ({
				key,
				color: diff === null ? null : (scale(diff) ?? null),
				votePercent: diff,
				partyName: selectedParty ?? null,
				notCompeting: diff === null
			}))
		};
	}

	// Stärkste Partei / 2. Stärkste Partei
	const counts = new Map<string, { color: string; count: number }>();
	for (const r of rows) {
		if (!r.color || !r.nameShort) continue;
		const entry = counts.get(r.nameShort);
		if (entry) entry.count += 1;
		else counts.set(r.nameShort, { color: r.color, count: 1 });
	}
	const entries = Array.from(counts, ([name, { color, count }]) => ({ name, color, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.map(({ name, color }) => ({ name, color }));

	return {
		keyField,
		legend: entries.length ? { type: 'parties', entries } : null,
		items: rows
			.map((r) => {
				const key = keyOf(r);
				if (key === null || !r.color) return null;
				const votePercent =
					r.votePercent === null || r.votePercent === undefined
						? null
						: Number(r.votePercent) * 100;
				return { key, color: r.color, votePercent, partyName: r.nameShort ?? null };
			})
			.filter((r) => r !== null) as RegionItem[]
	};
}
