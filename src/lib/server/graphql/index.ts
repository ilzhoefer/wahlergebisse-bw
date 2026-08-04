import { rumble } from '@m1212e/rumble';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import {
	getElectionTypes,
	getAllElectionDates,
	getParties,
	getMapInformation,
	getMapInformationPs,
	getRegionDetail,
	possibleMapModes,
	type MapMode,
	type MapInformationMode,
	type RegionDetail
} from '$lib/server/map/queries';
import { turnoutColorScale, partyColorScale } from '$lib/server/map/colors';

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
	type: 'turnout' | 'party' | 'parties';
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

const RegionDetailPartyRowRef = schemaBuilder
	.objectRef<RegionDetail['parties'][number]>('RegionDetailPartyRow')
	.implement({
		fields: (t) => ({
			partyFamilyId: t.exposeInt('partyFamilyId'),
			nameShort: t.exposeString('nameShort', { nullable: true }),
			color: t.exposeString('color', { nullable: true }),
			votePercent: t.exposeFloat('votePercent', { nullable: true }),
			voteCount: t.exposeInt('voteCount', { nullable: true })
		})
	});

const RegionDetailSeatGroupRef = schemaBuilder
	.objectRef<NonNullable<RegionDetail['seats']>['groups'][number]>('RegionDetailSeatGroup')
	.implement({
		fields: (t) => ({
			partyFamilyId: t.exposeInt('partyFamilyId', { nullable: true }),
			nameShort: t.exposeString('nameShort', { nullable: true }),
			color: t.exposeString('color', { nullable: true }),
			seatCount: t.exposeInt('seatCount'),
			candidateNames: t.stringList({ resolve: (parent) => parent.candidateNames })
		})
	});

const RegionDetailSeatsRef = schemaBuilder
	.objectRef<NonNullable<RegionDetail['seats']>>('RegionDetailSeats')
	.implement({
		fields: (t) => ({
			total: t.exposeInt('total'),
			groups: t.field({ type: [RegionDetailSeatGroupRef], resolve: (parent) => parent.groups })
		})
	});

const RegionDetailRef = schemaBuilder.objectRef<RegionDetail>('RegionDetail').implement({
	fields: (t) => ({
		turnoutPercent: t.exposeFloat('turnoutPercent', { nullable: true }),
		parties: t.field({ type: [RegionDetailPartyRowRef], resolve: (parent) => parent.parties }),
		seats: t.field({
			type: RegionDetailSeatsRef,
			nullable: true,
			resolve: (parent) => parent.seats
		})
	})
});

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
		resolve: (_root, args) => getParties(db, args.date, args.electionType)
	}),
	regionData: t.field({
		type: RegionDataRef,
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true }),
			mapMode: t.arg.string({ required: true }),
			mapInformation: t.arg.string({ required: true }),
			party: t.arg.string({ required: false }),
			voteType: t.arg.string({ required: false })
		},
		resolve: async (_root, args) => {
			const mapMode = args.mapMode as MapMode;
			const mapInformation = args.mapInformation as MapInformationMode;
			const selectedParty = args.party ?? undefined;
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
					(r) => r.name?.slice(0, 6) ?? null,
					selectedParty
				);
			}

			const rows = await getMapInformation(db, {
				selectedMapInformation: mapInformation,
				selectedMapMode: mapMode,
				selectedElectionType: args.electionType,
				selectedDate: args.date,
				selectedParty
			});
			const filtered =
				votetypeFilter === null ? rows : rows.filter((r) => r.votetypeId === votetypeFilter);
			const keyField = mapMode === 'Wahlkreis' ? 'ref' : 'rs';
			const keyOf = (r: (typeof filtered)[number]) =>
				'districtId' in r ? String(r.districtId) : 'rs' in r ? String(r.rs) : null;
			return buildResponse(keyField, mapInformation, filtered, keyOf, selectedParty);
		}
	}),
	regionDetail: t.field({
		type: RegionDetailRef,
		args: {
			electionType: t.arg.int({ required: true }),
			date: t.arg.string({ required: true }),
			mapMode: t.arg.string({ required: true }),
			// String, not Int: rs runs up to 12 digits and overflows GraphQL's 32-bit Int (same reason
			// RegionItem.key/keyOf are String-typed rather than Int elsewhere in this file).
			regionKey: t.arg.string({ required: true }),
			voteType: t.arg.string({ required: false })
		},
		resolve: (_root, args) => {
			const votetypeFilter =
				(args.electionType === 2 || args.electionType === 3) &&
				args.voteType !== null &&
				args.voteType !== undefined
					? Number(args.voteType)
					: null;
			return getRegionDetail(db, {
				selectedElectionType: args.electionType,
				selectedDate: args.date,
				selectedMapMode: args.mapMode as Exclude<MapMode, 'Wahlbezirk'>,
				regionKey: Number(args.regionKey),
				voteTypeFilter: votetypeFilter
			});
		}
	})
}));

interface Row {
	turnout?: string | null;
	votePercent?: string | null;
	color?: string | null;
	nameShort?: string | null;
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
