CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_election_candidate_name_trgm" ON "election_candidate" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_election_elected_candidates_name_trgm" ON "election_elected_candidates" USING gin ("name" gin_trgm_ops);