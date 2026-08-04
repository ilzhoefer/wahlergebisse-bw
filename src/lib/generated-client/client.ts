// This file is auto-generated. Do not edit manually.
// @generated
/* eslint-disable */
// biome-ignore-all lint: This file is auto-generated
// biome-ignore-all assist: This file is auto-generated
// biome-ignore-all syntax: This file is auto-generated
import { Client, fetchExchange } from '@urql/core';
import { cacheExchange } from '@urql/exchange-graphcache';
import { nativeDateExchange } from '@m1212e/rumble/client';
import { schema } from './schema';
import { makeLiveQuery, makeMutation, makeSubscription, makeQuery } from '@m1212e/rumble/client';

// MANUAL PATCH (re-add after regenerating via /dev/generate-graphql-client until the schema defines
// real mutations/subscriptions in Phase 3, or rumble's codegen is fixed to emit these unconditionally):
// the codegen only emits Mutation/Subscription type aliases when the schema actually defines fields
// for them — ours doesn't yet, but makeMutation<Mutation>/makeSubscription<Subscription> below still
// reference the type names unconditionally.
type Mutation = Record<string, never>;
type Subscription = Record<string, never>;

// MANUAL PATCH (re-add after regenerating): RegionData/RegionItem/Legend/LegendEntry (the map view's
// query result) are computed view models with no natural id, and the codegen doesn't emit a `keys`
// config for cacheExchange. Without one, graphcache can't produce a stable cache key for them, warns
// "Invalid key" on every field, and — combined with requestPolicy: 'cache-and-network' below — treats
// each keyless re-embed as invalidating the in-flight regionData query, which re-triggers it, which
// re-embeds, forever: switching map modes in the UI hit Svelte's effect_update_depth_exceeded loop
// guard because of this. Returning null tells graphcache these types are intentionally unkeyed.

export type BigInt = unknown;

export type BigIntWhereInputArgument = {
	AND?: BigIntWhereInputArgument[] | undefined;
	NOT?: BigIntWhereInputArgument | null | undefined;
	OR?: BigIntWhereInputArgument[] | undefined;
	eq?: BigInt | null | undefined;
	gt?: BigInt | null | undefined;
	gte?: BigInt | null | undefined;
	in?: BigInt[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	lt?: BigInt | null | undefined;
	lte?: BigInt | null | undefined;
	ne?: BigInt | null | undefined;
	notIn?: BigInt[] | undefined;
};

export type Boolean = boolean;

export type BooleanWhereInputArgument = {
	AND?: BooleanWhereInputArgument[] | undefined;
	NOT?: BooleanWhereInputArgument | null | undefined;
	OR?: BooleanWhereInputArgument[] | undefined;
	arrayContained?: Boolean[] | undefined;
	arrayContains?: Boolean[] | undefined;
	arrayOverlaps?: Boolean[] | undefined;
	eq?: Boolean | null | undefined;
	in?: Boolean[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	ne?: Boolean | null | undefined;
	notIn?: Boolean[] | undefined;
};

export type Bytes = unknown;

export type DateTime = Date;

export type DateTimeWhereInputArgument = {
	AND?: DateTimeWhereInputArgument[] | undefined;
	NOT?: DateTimeWhereInputArgument | null | undefined;
	OR?: DateTimeWhereInputArgument[] | undefined;
	arrayContained?: DateTime[] | undefined;
	arrayContains?: DateTime[] | undefined;
	arrayOverlaps?: DateTime[] | undefined;
	eq?: DateTime | null | undefined;
	gt?: DateTime | null | undefined;
	gte?: DateTime | null | undefined;
	in?: DateTime[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	lt?: DateTime | null | undefined;
	lte?: DateTime | null | undefined;
	ne?: DateTime | null | undefined;
	notIn?: DateTime[] | undefined;
};

export type DateWhereInputArgument = {
	AND?: DateWhereInputArgument[] | undefined;
	NOT?: DateWhereInputArgument | null | undefined;
	OR?: DateWhereInputArgument[] | undefined;
	arrayContained?: Date[] | undefined;
	arrayContains?: Date[] | undefined;
	arrayOverlaps?: Date[] | undefined;
	eq?: Date | null | undefined;
	gt?: Date | null | undefined;
	gte?: Date | null | undefined;
	ilike?: String | null | undefined;
	in?: Date[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	like?: String | null | undefined;
	lt?: Date | null | undefined;
	lte?: Date | null | undefined;
	ne?: Date | null | undefined;
	notIlike?: String | null | undefined;
	notIn?: Date[] | undefined;
	notLike?: String | null | undefined;
};

export type ElectionDate = {
	date: String | null;
	electionType: Int | null;
};

export type ElectionTypeOption = {
	electionDescription: String | null;
	electionType: Int;
};

export type Float = number;

export type FloatWhereInputArgument = {
	AND?: FloatWhereInputArgument[] | undefined;
	NOT?: FloatWhereInputArgument | null | undefined;
	OR?: FloatWhereInputArgument[] | undefined;
	arrayContained?: Float[] | undefined;
	arrayContains?: Float[] | undefined;
	arrayOverlaps?: Float[] | undefined;
	eq?: Float | null | undefined;
	gt?: Float | null | undefined;
	gte?: Float | null | undefined;
	ilike?: String | null | undefined;
	in?: Float[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	like?: String | null | undefined;
	lt?: Float | null | undefined;
	lte?: Float | null | undefined;
	ne?: Float | null | undefined;
	notIlike?: String | null | undefined;
	notIn?: Float[] | undefined;
	notLike?: String | null | undefined;
};

export type ID = string;

export type IDWhereInputArgument = {
	AND?: IDWhereInputArgument[] | undefined;
	NOT?: IDWhereInputArgument | null | undefined;
	OR?: IDWhereInputArgument[] | undefined;
	arrayContained?: ID[] | undefined;
	arrayContains?: ID[] | undefined;
	arrayOverlaps?: ID[] | undefined;
	eq?: ID | null | undefined;
	gt?: ID | null | undefined;
	gte?: ID | null | undefined;
	ilike?: String | null | undefined;
	in?: ID[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	like?: String | null | undefined;
	lt?: ID | null | undefined;
	lte?: ID | null | undefined;
	ne?: ID | null | undefined;
	notIlike?: String | null | undefined;
	notIn?: ID[] | undefined;
	notLike?: String | null | undefined;
};

export type Int = number;

export type IntWhereInputArgument = {
	AND?: IntWhereInputArgument[] | undefined;
	NOT?: IntWhereInputArgument | null | undefined;
	OR?: IntWhereInputArgument[] | undefined;
	arrayContained?: Int[] | undefined;
	arrayContains?: Int[] | undefined;
	arrayOverlaps?: Int[] | undefined;
	eq?: Int | null | undefined;
	gt?: Int | null | undefined;
	gte?: Int | null | undefined;
	ilike?: String | null | undefined;
	in?: Int[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	like?: String | null | undefined;
	lt?: Int | null | undefined;
	lte?: Int | null | undefined;
	ne?: Int | null | undefined;
	notIlike?: String | null | undefined;
	notIn?: Int[] | undefined;
	notLike?: String | null | undefined;
};

export type JSON = any;

export type JSONWhereInputArgument = {
	AND?: JSONWhereInputArgument[] | undefined;
	NOT?: JSONWhereInputArgument | null | undefined;
	OR?: JSONWhereInputArgument[] | undefined;
	arrayContained?: JSON[] | undefined;
	arrayContains?: JSON[] | undefined;
	arrayOverlaps?: JSON[] | undefined;
	eq?: JSON | null | undefined;
	in?: JSON[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	ne?: JSON | null | undefined;
	notIn?: JSON[] | undefined;
};

export type Legend = {
	color: String | null;
	entries: () => LegendEntry[];
	max: Float | null;
	min: Float | null;
	partyName: String | null;
	type: String;
};

export type LegendEntry = {
	color: String;
	name: String;
};

export type MapModes = {
	possibleModes: String[];
	selectedMode: String;
};

export type PartyOption = {
	nameShort: String | null;
	partyFamilyId: Int;
};

export type Query = {
	allElectionDates: () => ElectionDate[];
	electionTypes: () => ElectionTypeOption[];
	mapModes: (p: { electionType: Int }) => MapModes;
	parties: (p: { date: String; electionType: Int }) => PartyOption[];
	regionData: (p: {
		date: String;
		electionType: Int;
		mapInformation: String;
		mapMode: String;
		party?: String | null | undefined;
		voteType?: String | null | undefined;
	}) => RegionData;
};

export type RegionData = {
	items: () => RegionItem[];
	keyField: String;
	legend: () => Legend | null;
};

export type RegionItem = {
	color: String | null;
	key: String;
	notCompeting: Boolean | null;
	partyName: String | null;
	turnoutPercent: Float | null;
	votePercent: Float | null;
};

export type String = string;

export type StringWhereInputArgument = {
	AND?: StringWhereInputArgument[] | undefined;
	NOT?: StringWhereInputArgument | null | undefined;
	OR?: StringWhereInputArgument[] | undefined;
	arrayContained?: String[] | undefined;
	arrayContains?: String[] | undefined;
	arrayOverlaps?: String[] | undefined;
	eq?: String | null | undefined;
	gt?: String | null | undefined;
	gte?: String | null | undefined;
	ilike?: String | null | undefined;
	in?: String[] | undefined;
	isNotNull?: Boolean | null | undefined;
	isNull?: Boolean | null | undefined;
	like?: String | null | undefined;
	lt?: String | null | undefined;
	lte?: String | null | undefined;
	ne?: String | null | undefined;
	notIlike?: String | null | undefined;
	notIn?: String[] | undefined;
	notLike?: String | null | undefined;
};

export const defaultOptions: ConstructorParameters<Client>[0] = {
	url: '/graphql',
	fetchSubscriptions: true,
	exchanges: [
		cacheExchange({
			schema,
			keys: {
				RegionData: () => null,
				RegionItem: () => null,
				Legend: () => null,
				LegendEntry: () => null
			}
		}),
		nativeDateExchange,
		fetchExchange
	],
	fetchOptions: {
		credentials: 'include'
	},
	requestPolicy: 'cache-and-network'
};

const urqlClient = new Client(defaultOptions);

export const client = {
	/**
	 * A query and subscription combination. First queries and if exists, also subscribes to a subscription of the same name.
	 * Combines the results of both, so the result is first the query result and then live updates from the subscription.
	 * Assumes that the query and subscription return the same fields as per default when using the rumble query helpers.
	 * If no subscription with the same name exists, this will just be a query.
	 *
	 * Internally, this does some magic to make the data reactive with Svelte's reactivity system. But it can be used with other frameworks as well.
	 */
	liveQuery: makeLiveQuery<Query>({
		urqlClient,
		availableSubscriptions: new Set([]),
		schema
	}),
	/**
	 * A mutation that can be used to e.g. create, update or delete data.
	 */
	mutate: makeMutation<Mutation>({
		urqlClient,
		schema
	}),
	/**
	 * A continuous stream of results that updates when the server sends new data.
	 */
	subscribe: makeSubscription<Subscription>({
		urqlClient,
		schema
	}),
	/**
	 * A one-time fetch of data.
	 */
	query: makeQuery<Query>({
		urqlClient,
		schema
	})
};
