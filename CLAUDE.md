# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rewrite in progress

The app is being rewritten from R/Shiny onto SvelteKit + TypeScript + Bun + Drizzle ORM, matching
the stack of two sibling projects ([munify-delegator](https://github.com/DeutscheModelUnitedNations/munify-delegator),
[munify-chase](https://github.com/DeutscheModelUnitedNations/munify-chase)). The full plan lives at
`~/.claude/plans/staged-tumbling-pie.md` (phasing: scaffold+schema → map view → CSV export → admin
auth+scraper port → delete the legacy R/Shiny/SQL directories).

**New app** (repo root: `src/`, `drizzle/`, `docker-compose.yaml`, `Dockerfile`,
`.github/workflows/publish-image.yml`):

- `src/lib/server/db/schema.ts` + `relations.ts` — Drizzle schema mirroring the tables described
  under "Database schema" below (derived from `SQL/createdb.sql`'s domain semantics — that file
  itself has two SQL syntax errors and is not run against any real database, see the section below;
  treat `schema.ts` as the source of truth going forward).
- `drizzle.config.ts` / `bun run db:generate` / `bun run db:migrate` / `bun run db:studio` — schema
  migrations. `DATABASE_URL` comes from `.env` (see `.env.example`).
- `docker-compose.yaml` at the repo root is for **local dev/testing only** (starts a throwaway
  Postgres + pgAdmin); it is not the deployment artifact. Deployment images are built and published
  to GHCR by `.github/workflows/publish-image.yml`.
- Three features to (re)build, matching the legacy Shiny app's three tabs: a public map view, a
  public CSV export, and a password-gated admin page that triggers a data crawl (replacing manually
  running `Docker/shiny/new_data_calls.R`). See the plan file for the detailed design of each.

**Legacy R/Shiny stack** (`R-Code/`, `Docker/`, `SQL/`, `00_daten/`) is described in full below and
remains in the repo only until the rewrite fully replaces it (per the plan's cleanup phase) — it is
excluded from Prettier/ESLint (`.prettierignore`, `eslint.config.js`) accordingly. Do not extend it
with new features; port them to the new app instead.

## Project overview (legacy stack)

Scraper and dashboard for Baden-Württemberg local election results. It pulls election data from the public API behind `wahlergebnisse.komm.one`, stores it in a normalized Postgres database, and serves a Shiny dashboard for exploring results on a map. The project began as part of a master's thesis ("Do names matter in local elections?"); the thesis analysis code lives alongside the scraper/dashboard but is a separate concern (see "Thesis analysis code" below).

## Architecture (legacy stack)

Three stages, each in its own directory:

1. **Scraping** (`R-Code/`, `Docker/shiny/new_data_*.R`) — plain R scripts (no package/renv structure) that call the komm.one JSON API and write results into Postgres.
2. **Storage** (`SQL/createdb.sql`) — Postgres schema; `Docker/create_db.sh` restores a `pg_backup` dump on first container start if the DB is empty/tableless.
3. **Presentation** (`Docker/shiny/app.R` + helpers) — a Shiny app that queries Postgres directly and renders an interactive Leaflet map with `plotly` charts.

All three run together via `Docker/docker-compose.yaml` (services: `db`, `pgadmin`, `shiny`, `schemaspy`).

### Scraper: two generations of code

- `R-Code/main.R`, `R-Code/functions.R`, `R-Code/get_election_results.R` — the original thesis-era scraper. Reads/writes CSV snapshots in `R-Code/Database/` rather than talking to Postgres directly, and only handled one hardcoded election type/date at a time.
- `Docker/shiny/new_data_functions.R` + `Docker/shiny/new_data_calls.R` — the current scraper, called manually via `new_data_calls.R` when a new election needs to be ingested. It writes directly to Postgres via `pool`/`RPostgres`. Key functions and their call order (see `new_data_calls.R` for the canonical sequence):
  - `update_election_dates(cities)` — discover election dates per municipality from the komm.one termine API.
  - `set_election_type(database)` — classify each `elections` row into an `election_type` by regex-matching the election name (Gemeinderatswahl, Kreistagswahl, Bürgermeisterwahl, Ortschaftsratswahl, etc.).
  - `get_polling_stations_election(cities, date, election_type, skip_processed)` — fetch polling stations (`Wahlbezirke`) per city/election, including whether a station is postal-only (`Briefwahl`).
  - `get_results_city(cities, date, election_type, skip_processed)` → `get_results_single_ps(...)` — fetch and parse per-polling-station results (vote counts/percentages, candidates).
  - `update_party_family(date, election_type, override)` — map raw ballot-order party IDs (which differ per election/votetype) onto stable `party_family_id`s.
  - `update_aggregate_party(date, election_type, override)` — precompute the `election_result_aggregate_*` tables the dashboard map reads from (by region, district, and polling station).
  - `update_mapping_stuttgart(...)` — Stuttgart-specific 1:1 postal-to-normal polling station mapping (`election_ps_postal_mapping`), needed because Stuttgart is the only city currently maintained at polling-station-level map resolution.
  - `get_elected_members(cities, date, election_type)` — records which candidates were actually elected, including `Ausgleichsmandat`/leveling-seat cases for `Unechte Teilortswahl` municipalities.

  When adding a new election to the database, follow the sequence in `new_data_calls.R` — later steps depend on tables populated by earlier ones (e.g. aggregates depend on party-family mapping).

### Database schema (`SQL/createdb.sql`)

Table and column comments in the SQL file are authoritative — read them before writing queries. Core identifiers used throughout:

- `rs` (Regionalschlüssel) — 12-digit regional key identifying a municipality; the primary join key almost everywhere.
- `ags` (Amtlicher Gemeindeschlüssel) — 8-digit official municipality key, derived from `rs`, used only for building komm.one API URLs.
- `election_id` — scoped per `rs` (not globally unique), so most FKs are composite `(election_id, rs)`.
- `party_id` — scoped per `(election_id, rs, votetype_id)`; ballot order/numbering differs between elections, so `party_id` alone does **not** identify a party across elections. Use `party_family_id` (via `election_party_family`) to compare the same party across elections.
- `votetype_id` — distinguishes vote types within one election (e.g. list vote vs. personalized vote), scoped per `(election_id, rs)`.
- `ps_id` (polling station) — scoped per `(election_id, rs)`; can be a postal-only "station".

Raw per-polling-station results live in `election_result`/`election_result_ps`. The `election_result_aggregate_*` tables (by region/district/polling-station, party or meta/turnout) are precomputed rollups the Shiny app reads from directly rather than aggregating on the fly.

### Dashboard (`Docker/shiny/`)

- `app.R` — UI + server entrypoint; loads GeoJSON boundary files from `Docker/shiny/data/` (Bundestag/Landtag/Baden-Württemberg/Stutttgart district boundaries) and opens a `dbPool` connection to Postgres (`host = "db"` inside Docker).
- `shiny_functions.R` — data-fetching and map-composition logic (`shiny_map_information*`, `shiny_combine_polygons_information`, `shiny_colorscale_*`). Map resolution (`Regierungsbezirk`/`Kreis`/`Gemeinde`/`Wahlbezirk`/`Wahlkreis`) available depends on `election_type` — see `shiny_return_possible_map_modes`.
- `shiny_helpers.R` — small supporting utilities.
- `main.R` in this directory is not the Shiny entrypoint — it's a one-line scratch/dev file; the real app is started via `app.R`.

### Thesis analysis code (`Docker/shiny/analysis_*.R`)

Separate from the scraper/dashboard; not wired into `app.R`. See the header comment in `R-Code/source.R` for the intended structure:

- `analysis_functions.R` — LLM-based (OpenAI via `ellmer`) inference of candidate age/gender/perceived origin from names.
- `analysis_name_run_jobs.R` / `analysis_name_process_chunk.R` — parallelized version of the above using RStudio background jobs.
- `analysis_discriptive.R`, `analysis_regression.R`, `analysis_names.R` — figures/tables and OLS regressions for specific thesis chapters.
- `analysis_old.R` — dead code, kept for reference only (originally targeted LLaMA).

## Commands (new app)

See `README.md` for the full dev workflow (`bun install`, `docker compose up -d db`,
`bun run db:migrate`, `bun run dev`). `bun run check` type-checks; `bun run lint`/`format` run
ESLint/Prettier.

## Commands (legacy stack)

There is no package manifest, test suite, or linter in this repo — it's a collection of R scripts run interactively or via `docker compose`.

```bash
# Set up environment before first run
cp Docker/.env.example Docker/.env   # then fill in real DB_PASS / PG_ADMIN_PASS

# Start the full stack (Postgres + pgAdmin + Shiny dashboard + schemaspy)
docker compose -f Docker/docker-compose.yaml up

# Rebuild the Shiny image after changing Docker/shiny/*.R or its Dockerfile
docker compose -f Docker/docker-compose.yaml up --build shiny
```

- Dashboard: `http://localhost:8080`
- pgAdmin: `http://localhost:8888`
- On first start with an empty volume, `create_db.sh` restores `SQL/pg_backup` automatically; on later starts it leaves an existing database alone (it does **not** re-apply `createdb.sql` — that file documents the schema but isn't run automatically against an existing DB).
- To ingest a new election's data, run the steps in `Docker/shiny/new_data_calls.R` against the running Postgres instance (adjust the hardcoded date/`election_type` at the top of the file for the new election).

## Working with this codebase

- Scripts assume being run with the R working directory set to the file's own folder (`R-Code/` or `Docker/shiny/`), not the repo root.
- Several files (`Docker/shiny/app.R`, `Docker/shiny/new_data_calls.R`, `R-Code/20250512_accessDB.R`) contain a hardcoded Postgres password instead of reading `DB_PASS` from the environment — be aware of this if touching DB connection code, but don't "fix" it as a drive-by change without confirming with the user, since these are committed, git-tracked files.
- `00_daten/` holds raw source documents (Bekanntmachungen PDFs/spreadsheets per Landkreis) used for manual cross-checking, not machine-parsed inputs to the scraper.
- `R-Code/Database/*.csv` are point-in-time exports from the legacy CSV-based scraper flow, not the live data source (the live data is in Postgres).
