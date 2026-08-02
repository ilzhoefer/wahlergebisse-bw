import {
	pgTable,
	integer,
	bigint,
	serial,
	text,
	date,
	boolean,
	numeric,
	timestamp,
	foreignKey,
	unique,
	index
} from 'drizzle-orm/pg-core';

/**
 * Domain notes (ported from SQL/createdb.sql, which documents but no longer defines the schema):
 * - `rs` (Regionalschlüssel) is the 12-digit regional key identifying a municipality; the primary
 *   join key almost everywhere.
 * - `ags` (Amtlicher Gemeindeschlüssel) is an 8-digit key derived from `rs`, used only for building
 *   the scraper's komm.one API URLs.
 * - `electionId` is scoped per `rs`, not globally unique — most FKs to `elections` are composite
 *   `(electionId, rs)`.
 * - `partyId` is scoped per `(electionId, rs, votetypeId)`; ballot order/numbering differs between
 *   elections, so `partyId` alone does not identify a party across elections. Use `partyFamilyId`
 *   (via `electionPartyFamily`) to compare the same party across elections.
 * - `votetypeId` distinguishes vote types within one election (e.g. list vote vs. personalized vote).
 * - `psId` (polling station) is scoped per `(electionId, rs)`; can be a postal-only "station".
 *
 * The source schema (and the real, currently-deployed database) has no single-column primary key on
 * most tables — only composite UNIQUE constraints. Every table below still has that original composite
 * key, preserved as a `unique(...)` constraint — but each also gets a surrogate `id: serial().primaryKey()`
 * column, added so rumble's table introspection (which only recognizes single-column primary keys, not
 * composite ones — see the "Rumble migration B" plan notes) can process every table without crashing.
 * The surrogate `id` is not used by any application query; the composite natural key is still how rows
 * are actually looked up and joined everywhere in this codebase.
 */

export const cities = pgTable('cities', {
	rs: bigint('rs', { mode: 'number' }).primaryKey(),
	ags: bigint('ags', { mode: 'number' }),
	name: text('name'),
	population: integer('population')
});

export const electionType = pgTable('election_type', {
	electionType: integer('election_type').primaryKey(),
	electionDescription: text('election_description')
});

export const party = pgTable('party', {
	partyFamilyId: integer('party_family_id').primaryKey(),
	nameShort: text('name_short'),
	nameLong: text('name_long'),
	color: text('color')
});

export const elections = pgTable(
	'elections',
	{
		id: serial('id').primaryKey(),
		electionId: integer('election_id').notNull(),
		electionType: integer('election_type').references(() => electionType.electionType),
		electionName: text('election_name'),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		date: date('date', { mode: 'string' }),
		/** Additional result ID from Votemanager (the source system behind komm.one). */
		resultId: text('result_id')
	},
	(table) => [
		unique('unique_elections').on(table.electionId, table.rs),
		index('idx_elections_election_id_rs').on(
			table.electionId,
			table.rs,
			table.electionType,
			table.date
		)
	]
);

export const electionsVotetypes = pgTable(
	'elections_votetypes',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' }).notNull(),
		electionId: integer('election_id').notNull(),
		votetypeId: integer('votetype_id').notNull(),
		votetypeDescription: text('votetype_description')
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		unique('unique_elections_votetypes').on(table.electionId, table.rs, table.votetypeId)
	]
);

/** For personalized elections (Erststimme) the candidate is the party. */
export const electionParty = pgTable(
	'election_party',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		electionId: integer('election_id').notNull(),
		/** Party ID inside one election+city, counted up in ballot order. Not stable across elections. */
		partyId: integer('party_id').notNull(),
		votetypeId: integer('votetype_id').notNull(),
		psId: integer('ps_id'),
		name: text('name'),
		color: text('color'),
		nameLong: text('name_long')
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		unique('unique_election_party').on(table.rs, table.partyId, table.electionId, table.votetypeId)
	]
);

/**
 * Maps parties/candidates to their party family (their real party) for one election. Needed because
 * ballot order/party_id differs between elections and votetypes, and a list/candidate can be shared
 * between parties.
 */
export const electionPartyFamily = pgTable(
	'election_party_family',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		// Nullable in the source SQL, but every ballot line gets classified into a family by
		// update_party_family (see new_data_functions.R) — never actually null once written.
		partyFamilyId: integer('party_family_id')
			.notNull()
			.references(() => party.partyFamilyId),
		electionId: integer('election_id').notNull(),
		psId: integer('ps_id'),
		partyId: integer('party_id').notNull(),
		votetypeId: integer('votetype_id').notNull()
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		foreignKey({
			columns: [table.partyId, table.electionId, table.votetypeId, table.rs],
			foreignColumns: [
				electionParty.partyId,
				electionParty.electionId,
				electionParty.votetypeId,
				electionParty.rs
			]
		}),
		unique('unique_election_party_family').on(
			table.electionId,
			table.rs,
			table.partyFamilyId,
			table.partyId,
			table.votetypeId
		)
	]
);

export const pollingStations = pgTable(
	'polling_stations',
	{
		id: serial('id').primaryKey(),
		psId: integer('ps_id').notNull(),
		name: text('name'),
		/** DB column is genuinely spelled "adress" (typo in the original schema) — preserved as-is. */
		address: text('adress'),
		/** Accessibility info (barrierefrei) for normal stations; null/cleared for postal stations. */
		description: text('description'),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		date: date('date', { mode: 'string' }),
		isPostal: boolean('is_postal'),
		electionId: integer('election_id').notNull()
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		unique('unique_polling_stations').on(table.psId, table.rs, table.electionId),
		index('idx_polling_stations_election_id_rs').on(table.electionId, table.rs)
	]
);

/** Detailed per-polling-station results for each party/candidate. */
export const electionResult = pgTable(
	'election_result',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		electionId: integer('election_id').notNull(),
		psId: integer('ps_id').notNull(),
		partyId: integer('party_id').notNull(),
		votetypeId: integer('votetype_id').notNull(),
		voteCount: numeric('vote_count'),
		votePercent: numeric('vote_percent'),
		candidateName: text('candidate_name').notNull(),
		/** Currently not populated by the scraper. */
		candidateOccupation: text('candidate_occupation'),
		/** Currently not populated by the scraper. */
		candidateAge: integer('candidate_age')
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		foreignKey({
			columns: [table.psId, table.electionId, table.rs],
			foreignColumns: [pollingStations.psId, pollingStations.electionId, pollingStations.rs]
		}),
		foreignKey({
			columns: [table.votetypeId, table.electionId, table.rs],
			foreignColumns: [
				electionsVotetypes.votetypeId,
				electionsVotetypes.electionId,
				electionsVotetypes.rs
			]
		}),
		unique('unique_election_result').on(
			table.rs,
			table.partyId,
			table.electionId,
			table.psId,
			table.candidateName,
			table.votetypeId
		),
		index('idx_election_result').on(table.electionId, table.psId, table.rs)
	]
);

/** Aggregated turnout/meta numbers for each polling station. */
export const electionResultPs = pgTable(
	'election_result_ps',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		electionId: integer('election_id').notNull(),
		psId: integer('ps_id').notNull(),
		votetypeId: integer('votetype_id').notNull(),
		votesEligible: numeric('votes_eligible'),
		voters: numeric('voters'),
		invalidBallots: numeric('invalid_ballots'),
		validBallots: numeric('valid_ballots'),
		/** Can differ from `voters` if one voter has more than one vote. */
		votesCast: numeric('votes_cast'),
		turnout: numeric('turnout')
	},
	(table) => [
		foreignKey({
			columns: [table.electionId, table.rs],
			foreignColumns: [elections.electionId, elections.rs]
		}),
		foreignKey({
			columns: [table.psId, table.electionId, table.rs],
			foreignColumns: [pollingStations.psId, pollingStations.electionId, pollingStations.rs]
		}),
		foreignKey({
			columns: [table.votetypeId, table.electionId, table.rs],
			foreignColumns: [
				electionsVotetypes.votetypeId,
				electionsVotetypes.electionId,
				electionsVotetypes.rs
			]
		}),
		unique('unique_election_result_ps').on(
			table.rs,
			table.electionId,
			table.psId,
			table.votetypeId
		),
		index('idx_election_result_ps').on(table.electionId, table.psId, table.rs)
	]
);

/**
 * Maps polling stations to postal voting records. Only maintained for Stuttgart, which is the only
 * city with a 1:1 relationship between postal and normal polling stations.
 */
export const electionPsPostalMapping = pgTable(
	'election_ps_postal_mapping',
	{
		id: serial('id').primaryKey(),
		// Key columns are nullable in the source SQL, but a mapping row is meaningless without all
		// four identifying values, so they're never actually null once written.
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		psId: integer('ps_id').notNull(),
		psIdPostal: integer('ps_id_postal')
	},
	(table) => [
		unique('unique_election_ps_postal_mapping').on(
			table.rs,
			table.electionType,
			table.date,
			table.psId
		)
	]
);

/**
 * Maps municipalities to voting districts (Wahlkreise). If a municipality has more than one voting
 * district, polling stations are maintained as well.
 *
 * NOTE: deliberately kept as a `unique()` constraint, not converted to `primaryKey()` like its sibling
 * mapping tables — `psId` is genuinely, intentionally nullable here (single-district municipalities
 * have no per-station row), and Postgres primary keys cannot contain NULLs. Not exposed as a Pothos
 * `object()`/`query()` table for this reason; read via manual Drizzle queries instead.
 */
export const electionVoteDistrictMapping = pgTable(
	'election_vote_district_mapping',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' }),
		electionType: integer('election_type').references(() => electionType.electionType),
		date: date('date', { mode: 'string' }),
		/** Only maintained if the whole municipality is split into different voting districts. */
		psId: integer('ps_id'),
		/** Official voting district ID. */
		districtId: integer('district_id')
	},
	(table) => [
		unique('unique_election_vote_district_mapping').on(
			table.rs,
			table.electionType,
			table.date,
			table.psId
		)
	]
);

/**
 * Tracks elected candidates for each election, including Ausgleichsmandat (leveling-seat) cases for
 * Unechte Teilortswahl municipalities.
 */
export const electionElectedCandidates = pgTable(
	'election_elected_candidates',
	{
		id: serial('id').primaryKey(),
		// rs/electionType/date/electionId/name are nullable in the source SQL, but a row is meaningless
		// without those five, so they're never actually null once written. partyId is genuinely nullable
		// though — get_elected_members joins the API's "Wahlvorschlag" candidate-list name against
		// election_party.name, and that join can legitimately miss (independent candidates, list-name
		// formatting mismatches), same as in the original.
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		electionId: integer('election_id').notNull(),
		partyId: integer('party_id'),
		name: text('name').notNull(),
		mandateType: text('mandate_type')
	},
	(table) => [
		unique('unique_election_elected_candidates').on(
			table.rs,
			table.electionType,
			table.date,
			table.electionId,
			table.partyId,
			table.name
		)
	]
);

// The six aggregate tables below have no NOT NULL constraints in the source SQL, but every column in
// their identifying key is always populated by update_aggregate_party (new_data_functions.R) — a
// rollup row is meaningless without knowing which region/district, election, date and vote type it's
// for. Adding NOT NULL here (required for primaryKey()) reflects that real invariant, not a new one.

/** Precomputed rollup of results for each party across a region (municipality, district...). */
export const electionResultAggregatePartyRegion = pgTable(
	'election_result_aggregate_party_region',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' }).notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		partyFamilyId: integer('party_family_id')
			.notNull()
			.references(() => party.partyFamilyId),
		color: text('color'),
		votetypeId: integer('votetype_id').notNull(),
		voteCount: integer('vote_count'),
		votePercent: numeric('vote_percent')
	},
	(table) => [
		unique('unique_election_result_aggregate_party_region').on(
			table.partyFamilyId,
			table.rs,
			table.electionType,
			table.date,
			table.votetypeId
		)
	]
);

/** Precomputed general election statistics (turnout etc.) for each region. */
export const electionResultAggregateMetaRegion = pgTable(
	'election_result_aggregate_meta_region',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' }).notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		votetypeId: integer('votetype_id').notNull(),
		votesEligible: numeric('votes_eligible'),
		voters: numeric('voters'),
		invalidBallots: numeric('invalid_ballots'),
		validBallots: numeric('valid_ballots'),
		votesCast: numeric('votes_cast'),
		turnout: numeric('turnout')
	},
	(table) => [
		unique('unique_election_result_aggregate_meta_region').on(
			table.rs,
			table.electionType,
			table.date,
			table.votetypeId
		)
	]
);

/**
 * Precomputed rollup of results for each party by polling station. Only populated for Stuttgart (the
 * only city with a 1:1 postal/normal polling-station mapping, see `electionPsPostalMapping`) — do not
 * use this table for other municipalities' per-station data, use `electionResult` directly instead.
 */
export const electionResultAggregatePartyPs = pgTable(
	'election_result_aggregate_party_ps',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		psId: integer('ps_id').notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		partyFamilyId: integer('party_family_id')
			.notNull()
			.references(() => party.partyFamilyId),
		color: text('color'),
		votetypeId: integer('votetype_id').notNull(),
		voteCount: integer('vote_count'),
		votePercent: numeric('vote_percent')
	},
	(table) => [
		unique('unique_election_result_aggregate_party_ps').on(
			table.partyFamilyId,
			table.psId,
			table.rs,
			table.electionType,
			table.date,
			table.votetypeId
		)
	]
);

/** Stuttgart-only equivalent of `electionResultAggregateMetaRegion`, at polling-station grain. */
export const electionResultAggregateMetaPs = pgTable(
	'election_result_aggregate_meta_ps',
	{
		id: serial('id').primaryKey(),
		rs: bigint('rs', { mode: 'number' })
			.notNull()
			.references(() => cities.rs),
		psId: integer('ps_id').notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		votetypeId: integer('votetype_id').notNull(),
		votesEligible: numeric('votes_eligible'),
		voters: numeric('voters'),
		invalidBallots: numeric('invalid_ballots'),
		validBallots: numeric('valid_ballots'),
		votesCast: numeric('votes_cast'),
		turnout: numeric('turnout')
	},
	(table) => [
		unique('unique_election_result_aggregate_meta_ps').on(
			table.rs,
			table.psId,
			table.electionType,
			table.date,
			table.votetypeId
		)
	]
);

/** Precomputed rollup of results for each party by voting district (Wahlkreis). */
export const electionResultAggregatePartyDistrict = pgTable(
	'election_result_aggregate_party_district',
	{
		id: serial('id').primaryKey(),
		districtId: integer('district_id').notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		partyFamilyId: integer('party_family_id')
			.notNull()
			.references(() => party.partyFamilyId),
		color: text('color'),
		votetypeId: integer('votetype_id').notNull(),
		voteCount: integer('vote_count'),
		votePercent: numeric('vote_percent')
	},
	(table) => [
		unique('unique_election_result_aggregate_party_district').on(
			table.partyFamilyId,
			table.districtId,
			table.electionType,
			table.date,
			table.votetypeId
		)
	]
);

/** General election statistics by voting district (Wahlkreis). */
export const electionResultAggregateMetaDistrict = pgTable(
	'election_result_aggregate_meta_district',
	{
		id: serial('id').primaryKey(),
		districtId: integer('district_id').notNull(),
		electionType: integer('election_type')
			.notNull()
			.references(() => electionType.electionType),
		date: date('date', { mode: 'string' }).notNull(),
		votetypeId: integer('votetype_id').notNull(),
		votesEligible: numeric('votes_eligible'),
		voters: numeric('voters'),
		invalidBallots: numeric('invalid_ballots'),
		validBallots: numeric('valid_ballots'),
		votesCast: numeric('votes_cast'),
		turnout: numeric('turnout')
	},
	(table) => [
		unique('unique_election_result_aggregate_meta_district').on(
			table.electionType,
			table.districtId,
			table.date,
			table.votetypeId
		)
	]
);

/**
 * Thesis-specific: name-based predictions (age, gender, perceived origin) of candidates. Not read by
 * any of the public app's three features (map, CSV export, admin crawl) — kept for schema completeness.
 */
export const analysisName = pgTable(
	'analysis_name',
	{
		id: serial('id').primaryKey(),
		electionType: integer('election_type').references(() => electionType.electionType),
		date: date('date', { mode: 'string' }),
		rs: bigint('rs', { mode: 'number' }).references(() => cities.rs),
		aiModel: text('ai_model'),
		/** Names are passed to the model multiple times; this is the run index. */
		run: integer('run'),
		candidateName: text('candidate_name'),
		partyId: integer('party_id'),
		candidateAge: integer('candidate_age'),
		/** 1 = very likely male, 10 = very unlikely male. */
		candidateGender: integer('candidate_gender'),
		/** 1 = very likely of German origin, 10 = very unlikely of German origin. */
		candidateOrigin: integer('candidate_origin')
	},
	(table) => [
		unique('unique_analysis_name').on(
			table.electionType,
			table.date,
			table.rs,
			table.aiModel,
			table.run,
			table.candidateName,
			table.partyId
		)
	]
);

/**
 * Thesis-specific: variance of vote counts between candidates within one party list at a polling
 * station. Not read by any of the public app's three features — kept for schema completeness.
 */
export const analysisVariance = pgTable(
	'analysis_variance',
	{
		id: serial('id').primaryKey(),
		electionType: integer('election_type').references(() => electionType.electionType),
		date: date('date', { mode: 'string' }),
		rs: bigint('rs', { mode: 'number' }).references(() => cities.rs),
		psId: integer('ps_id'),
		partyId: integer('party_id'),
		standardDeviation: numeric('standard_deviation'),
		cv: numeric('cv')
	},
	(table) => [
		unique('unique_analysis_variance').on(
			table.electionType,
			table.date,
			table.rs,
			table.psId,
			table.partyId
		)
	]
);

/**
 * Tracks one admin-triggered scraper run (Phase 3). Not part of the legacy R schema — new for the
 * rewrite. Durable record of progress/outcome so the admin page can show "last run" status even after
 * a server restart, independent of the in-process crawl-runner singleton used for live progress.
 */
export const crawlRun = pgTable('crawl_run', {
	id: serial('id').primaryKey(),
	electionType: integer('election_type').notNull(),
	date: date('date', { mode: 'string' }).notNull(),
	/** 'running' | 'done' | 'error' */
	status: text('status').notNull(),
	currentStep: text('current_step'),
	/** Newline-joined progress log, latest entries only (truncated to a reasonable size). */
	log: text('log'),
	error: text('error'),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true })
});
