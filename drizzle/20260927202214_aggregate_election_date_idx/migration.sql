CREATE INDEX "idx_election_result_aggregate_meta_ps_election" ON "election_result_aggregate_meta_ps" ("election_type","date");--> statement-breakpoint
CREATE INDEX "idx_election_result_aggregate_meta_region_election" ON "election_result_aggregate_meta_region" ("election_type","date");--> statement-breakpoint
CREATE INDEX "idx_election_result_aggregate_party_district_election" ON "election_result_aggregate_party_district" ("election_type","date");--> statement-breakpoint
CREATE INDEX "idx_election_result_aggregate_party_ps_election" ON "election_result_aggregate_party_ps" ("election_type","date");--> statement-breakpoint
CREATE INDEX "idx_election_result_aggregate_party_region_election" ON "election_result_aggregate_party_region" ("election_type","date");