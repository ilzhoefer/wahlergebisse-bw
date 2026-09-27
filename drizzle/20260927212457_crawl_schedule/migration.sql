CREATE TABLE "crawl_schedule" (
	"id" integer PRIMARY KEY,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"interval_minutes" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crawl_schedule" ADD CONSTRAINT "crawl_schedule_election_type_election_type_election_type_fkey" FOREIGN KEY ("election_type") REFERENCES "election_type"("election_type");