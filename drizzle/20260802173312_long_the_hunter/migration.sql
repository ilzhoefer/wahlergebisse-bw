CREATE TABLE "analysis_name" (
	"id" serial PRIMARY KEY,
	"election_type" integer,
	"date" date,
	"rs" bigint,
	"ai_model" text,
	"run" integer,
	"candidate_name" text,
	"party_id" integer,
	"candidate_age" integer,
	"candidate_gender" integer,
	"candidate_origin" integer,
	CONSTRAINT "unique_analysis_name" UNIQUE("election_type","date","rs","ai_model","run","candidate_name","party_id")
);
--> statement-breakpoint
CREATE TABLE "analysis_variance" (
	"id" serial PRIMARY KEY,
	"election_type" integer,
	"date" date,
	"rs" bigint,
	"ps_id" integer,
	"party_id" integer,
	"standard_deviation" numeric,
	"cv" numeric,
	CONSTRAINT "unique_analysis_variance" UNIQUE("election_type","date","rs","ps_id","party_id")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"rs" bigint PRIMARY KEY,
	"ags" bigint,
	"name" text,
	"population" integer
);
--> statement-breakpoint
CREATE TABLE "election_elected_candidates" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"election_id" integer NOT NULL,
	"party_id" integer NOT NULL,
	"name" text NOT NULL,
	"mandate_type" text,
	CONSTRAINT "unique_election_elected_candidates" UNIQUE("rs","election_type","date","election_id","party_id","name")
);
--> statement-breakpoint
CREATE TABLE "election_party" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_id" integer NOT NULL,
	"party_id" integer NOT NULL,
	"votetype_id" integer NOT NULL,
	"ps_id" integer,
	"name" text,
	"color" text,
	"name_long" text,
	CONSTRAINT "unique_election_party" UNIQUE("rs","party_id","election_id","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_party_family" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"party_family_id" integer NOT NULL,
	"election_id" integer NOT NULL,
	"ps_id" integer,
	"party_id" integer NOT NULL,
	"votetype_id" integer NOT NULL,
	CONSTRAINT "unique_election_party_family" UNIQUE("election_id","rs","party_family_id","party_id","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_ps_postal_mapping" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"ps_id" integer NOT NULL,
	"ps_id_postal" integer,
	CONSTRAINT "unique_election_ps_postal_mapping" UNIQUE("rs","election_type","date","ps_id")
);
--> statement-breakpoint
CREATE TABLE "election_result" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_id" integer NOT NULL,
	"ps_id" integer NOT NULL,
	"party_id" integer NOT NULL,
	"votetype_id" integer NOT NULL,
	"vote_count" numeric,
	"vote_percent" numeric,
	"candidate_name" text NOT NULL,
	"candidate_occupation" text,
	"candidate_age" integer,
	CONSTRAINT "unique_election_result" UNIQUE("rs","party_id","election_id","ps_id","candidate_name","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_meta_district" (
	"id" serial PRIMARY KEY,
	"district_id" integer NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"votetype_id" integer NOT NULL,
	"votes_eligible" numeric,
	"voters" numeric,
	"invalid_ballots" numeric,
	"valid_ballots" numeric,
	"votes_cast" numeric,
	"turnout" numeric,
	CONSTRAINT "unique_election_result_aggregate_meta_district" UNIQUE("election_type","district_id","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_meta_ps" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"ps_id" integer NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"votetype_id" integer NOT NULL,
	"votes_eligible" numeric,
	"voters" numeric,
	"invalid_ballots" numeric,
	"valid_ballots" numeric,
	"votes_cast" numeric,
	"turnout" numeric,
	CONSTRAINT "unique_election_result_aggregate_meta_ps" UNIQUE("rs","ps_id","election_type","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_meta_region" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"votetype_id" integer NOT NULL,
	"votes_eligible" numeric,
	"voters" numeric,
	"invalid_ballots" numeric,
	"valid_ballots" numeric,
	"votes_cast" numeric,
	"turnout" numeric,
	CONSTRAINT "unique_election_result_aggregate_meta_region" UNIQUE("rs","election_type","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_party_district" (
	"id" serial PRIMARY KEY,
	"district_id" integer NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"party_family_id" integer NOT NULL,
	"color" text,
	"votetype_id" integer NOT NULL,
	"vote_count" integer,
	"vote_percent" numeric,
	CONSTRAINT "unique_election_result_aggregate_party_district" UNIQUE("party_family_id","district_id","election_type","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_party_ps" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"ps_id" integer NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"party_family_id" integer NOT NULL,
	"color" text,
	"votetype_id" integer NOT NULL,
	"vote_count" integer,
	"vote_percent" numeric,
	CONSTRAINT "unique_election_result_aggregate_party_ps" UNIQUE("party_family_id","ps_id","rs","election_type","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_aggregate_party_region" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"party_family_id" integer NOT NULL,
	"color" text,
	"votetype_id" integer NOT NULL,
	"vote_count" integer,
	"vote_percent" numeric,
	CONSTRAINT "unique_election_result_aggregate_party_region" UNIQUE("party_family_id","rs","election_type","date","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_result_ps" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_id" integer NOT NULL,
	"ps_id" integer NOT NULL,
	"votetype_id" integer NOT NULL,
	"votes_eligible" numeric,
	"voters" numeric,
	"invalid_ballots" numeric,
	"valid_ballots" numeric,
	"votes_cast" numeric,
	"turnout" numeric,
	CONSTRAINT "unique_election_result_ps" UNIQUE("rs","election_id","ps_id","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "election_type" (
	"election_type" integer PRIMARY KEY,
	"election_description" text
);
--> statement-breakpoint
CREATE TABLE "election_vote_district_mapping" (
	"id" serial PRIMARY KEY,
	"rs" bigint,
	"election_type" integer,
	"date" date,
	"ps_id" integer,
	"district_id" integer,
	CONSTRAINT "unique_election_vote_district_mapping" UNIQUE("rs","election_type","date","ps_id")
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" serial PRIMARY KEY,
	"election_id" integer NOT NULL,
	"election_type" integer,
	"election_name" text,
	"rs" bigint NOT NULL,
	"date" date,
	"result_id" text,
	CONSTRAINT "unique_elections" UNIQUE("election_id","rs")
);
--> statement-breakpoint
CREATE TABLE "elections_votetypes" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_id" integer NOT NULL,
	"votetype_id" integer NOT NULL,
	"votetype_description" text,
	CONSTRAINT "unique_elections_votetypes" UNIQUE("election_id","rs","votetype_id")
);
--> statement-breakpoint
CREATE TABLE "party" (
	"party_family_id" integer PRIMARY KEY,
	"name_short" text,
	"name_long" text,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "polling_stations" (
	"id" serial PRIMARY KEY,
	"ps_id" integer NOT NULL,
	"name" text,
	"adress" text,
	"description" text,
	"rs" bigint NOT NULL,
	"date" date,
	"is_postal" boolean,
	"election_id" integer NOT NULL,
	CONSTRAINT "unique_polling_stations" UNIQUE("ps_id","rs","election_id")
);
--> statement-breakpoint
CREATE INDEX "idx_election_result" ON "election_result" ("election_id","ps_id","rs");--> statement-breakpoint
CREATE INDEX "idx_election_result_ps" ON "election_result_ps" ("election_id","ps_id","rs");--> statement-breakpoint
CREATE INDEX "idx_elections_election_id_rs" ON "elections" ("election_id","rs","election_type","date");--> statement-breakpoint
CREATE INDEX "idx_polling_stations_election_id_rs" ON "polling_stations" ("election_id","rs");--> statement-breakpoint
ALTER TABLE "analysis_name" ADD CONSTRAINT "analysis_name_election_type_election_type_election_type_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "analysis_name" ADD CONSTRAINT "analysis_name_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "analysis_variance" ADD CONSTRAINT "analysis_variance_iEcRM6v0onjt_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "analysis_variance" ADD CONSTRAINT "analysis_variance_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_elected_candidates" ADD CONSTRAINT "election_elected_candidates_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_elected_candidates" ADD CONSTRAINT "election_elected_candidates_dyG1WMrDtEho_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_party" ADD CONSTRAINT "election_party_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_party" ADD CONSTRAINT "election_party_election_id_rs_elections_election_id_rs_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");--> statement-breakpoint
ALTER TABLE "election_party_family" ADD CONSTRAINT "election_party_family_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_party_family" ADD CONSTRAINT "election_party_family_f7QRalb8floo_fkey" FOREIGN KEY ("party_family_id") REFERENCES "party"("party_family_id");--> statement-breakpoint
ALTER TABLE "election_party_family" ADD CONSTRAINT "election_party_family_iiYX6KRhVzgG_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");--> statement-breakpoint
ALTER TABLE "election_party_family" ADD CONSTRAINT "election_party_family_mYBlj7FAheRU_fkey" FOREIGN KEY ("party_id","election_id","votetype_id","rs") REFERENCES "election_party"("party_id","election_id","votetype_id","rs");--> statement-breakpoint
ALTER TABLE "election_ps_postal_mapping" ADD CONSTRAINT "election_ps_postal_mapping_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_ps_postal_mapping" ADD CONSTRAINT "election_ps_postal_mapping_VMeLcjabf4GR_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result" ADD CONSTRAINT "election_result_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_result" ADD CONSTRAINT "election_result_election_id_rs_elections_election_id_rs_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");--> statement-breakpoint
ALTER TABLE "election_result" ADD CONSTRAINT "election_result_o67KorE5F1uX_fkey" FOREIGN KEY ("ps_id","election_id","rs") REFERENCES "polling_stations"("ps_id","election_id","rs");--> statement-breakpoint
ALTER TABLE "election_result" ADD CONSTRAINT "election_result_3tdO0ealWaIo_fkey" FOREIGN KEY ("votetype_id","election_id","rs") REFERENCES "elections_votetypes"("votetype_id","election_id","rs");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_meta_district" ADD CONSTRAINT "election_result_aggregate_meta_district_do7PPqTRZg8R_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_meta_ps" ADD CONSTRAINT "election_result_aggregate_meta_ps_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_meta_ps" ADD CONSTRAINT "election_result_aggregate_meta_ps_cREGr495q0Ia_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_meta_region" ADD CONSTRAINT "election_result_aggregate_meta_region_PKQE7jjogfaH_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_district" ADD CONSTRAINT "election_result_aggregate_party_district_Gh4aTMe4rtUC_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_district" ADD CONSTRAINT "election_result_aggregate_party_district_6nkWnTXlR5lq_fkey" FOREIGN KEY ("party_family_id") REFERENCES "party"("party_family_id");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_ps" ADD CONSTRAINT "election_result_aggregate_party_ps_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_ps" ADD CONSTRAINT "election_result_aggregate_party_ps_ew994keyji5R_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_ps" ADD CONSTRAINT "election_result_aggregate_party_ps_tVItKaxVoic5_fkey" FOREIGN KEY ("party_family_id") REFERENCES "party"("party_family_id");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_region" ADD CONSTRAINT "election_result_aggregate_party_region_tHnabi2EXEu4_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "election_result_aggregate_party_region" ADD CONSTRAINT "election_result_aggregate_party_region_un0dm1MhccRA_fkey" FOREIGN KEY ("party_family_id") REFERENCES "party"("party_family_id");--> statement-breakpoint
ALTER TABLE "election_result_ps" ADD CONSTRAINT "election_result_ps_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_result_ps" ADD CONSTRAINT "election_result_ps_election_id_rs_elections_election_id_rs_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");--> statement-breakpoint
ALTER TABLE "election_result_ps" ADD CONSTRAINT "election_result_ps_vx6BgwT66Xo9_fkey" FOREIGN KEY ("ps_id","election_id","rs") REFERENCES "polling_stations"("ps_id","election_id","rs");--> statement-breakpoint
ALTER TABLE "election_result_ps" ADD CONSTRAINT "election_result_ps_ZJlDoF18bueG_fkey" FOREIGN KEY ("votetype_id","election_id","rs") REFERENCES "elections_votetypes"("votetype_id","election_id","rs");--> statement-breakpoint
ALTER TABLE "election_vote_district_mapping" ADD CONSTRAINT "election_vote_district_mapping_W8ur2q7fwq95_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_election_type_election_type_election_type_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "elections_votetypes" ADD CONSTRAINT "elections_votetypes_VnxpXOxdLL7x_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_election_id_rs_elections_election_id_rs_fkey" FOREIGN KEY ("election_id","rs") REFERENCES "elections"("election_id","rs");