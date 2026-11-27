CREATE TABLE "election_candidate" (
	"id" serial PRIMARY KEY,
	"rs" bigint NOT NULL,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"election_id" integer NOT NULL,
	"party_id" integer NOT NULL,
	"list_name" text,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"position" integer NOT NULL,
	"votes" integer NOT NULL,
	"elected" boolean NOT NULL,
	CONSTRAINT "unique_election_candidate" UNIQUE("rs","election_id","party_id","name")
);
--> statement-breakpoint
CREATE INDEX "idx_election_candidate_name_key" ON "election_candidate" ("name_key");--> statement-breakpoint
CREATE INDEX "idx_election_candidate_election" ON "election_candidate" ("election_type","date","rs");--> statement-breakpoint
ALTER TABLE "election_candidate" ADD CONSTRAINT "election_candidate_rs_cities_rs_fkey" FOREIGN KEY ("rs") REFERENCES "cities"("rs");--> statement-breakpoint
ALTER TABLE "election_candidate" ADD CONSTRAINT "election_candidate_F0vkrv8O2jZU_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");