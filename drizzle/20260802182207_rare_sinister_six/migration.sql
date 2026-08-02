CREATE TABLE "crawl_run" (
	"id" serial PRIMARY KEY,
	"election_type" integer NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"current_step" text,
	"log" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
