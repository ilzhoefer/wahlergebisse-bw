ALTER TABLE "crawl_run" ADD COLUMN "city_status" jsonb;--> statement-breakpoint
-- The old newline-joined text becomes one {t: null, level: 'info', text} entry per line.
ALTER TABLE "crawl_run" ALTER COLUMN "log" SET DATA TYPE jsonb USING to_jsonb(string_to_array("log", E'\n'));--> statement-breakpoint
UPDATE "crawl_run" SET "log" = (
	SELECT jsonb_agg(jsonb_build_object('t', null, 'level', 'info', 'text', l.line) ORDER BY l.n)
	FROM jsonb_array_elements_text("crawl_run"."log") WITH ORDINALITY AS l(line, n)
) WHERE "log" IS NOT NULL;
