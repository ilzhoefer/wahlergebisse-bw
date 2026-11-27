ALTER TABLE "election_candidate" ADD COLUMN "district_id" integer;--> statement-breakpoint
ALTER TABLE "election_candidate" ALTER COLUMN "position" DROP NOT NULL;