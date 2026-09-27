# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Scraper and dashboard for Baden-Württemberg election results, from Gemeinderat up to Bundestag. It
pulls data from the public API behind `wahlergebnisse.komm.one` (plus Statistik-BW / Kreis open-data
imports), stores it in Postgres, and serves a public map, a CSV export and a password-gated admin
page that runs crawls. Stack: SvelteKit + TypeScript + Bun + Drizzle ORM + GraphQL (rumble/Pothos/
Yoga), matching two sibling projects ([munify-delegator](https://github.com/DeutscheModelUnitedNations/munify-delegator),
[munify-chase](https://github.com/DeutscheModelUnitedNations/munify-chase)). The project began as
part of a master's thesis; the original R/Shiny app and thesis analysis code were removed from the
tree and live only in git history.

- `src/lib/server/db/schema.ts` + `relations.ts` — Drizzle schema, the source of truth. Migrations via
  `bun run db:generate` / `db:migrate` / `db:studio`; `DATABASE_URL` from `.env` (see `.env.example`).
- `src/lib/server/scraper/runCrawl.ts` — the crawl sequence (a port of the legacy `new_data_calls.R`).
  Later steps depend on tables populated by earlier ones (aggregates depend on the party-family
  mapping), so keep the order. Started from `/admin` via `src/lib/server/crawl-runner/`.
- `src/lib/server/map/queries.ts` + `src/lib/server/graphql/index.ts` — map read queries, memoized
  per process until the next crawl (`src/lib/server/queryCache.ts`).
- `scripts/prepare-*.ts` regenerate the boundary/Wahlkreis files in `src/lib/geo/` and
  `src/lib/server/scraper/vote-districts/` from the raw inputs in `scripts/source-data/`.
- `docker-compose.yaml` is for **local dev only** (Postgres + pgAdmin). Deployment images are built
  and published to GHCR by `.github/workflows/publish-image.yml`; `.github/workflows/ci.yml` runs
  check, lint and the offline `scripts/check-*.ts` self-checks.

### Domain identifiers

- `rs` (Regionalschlüssel) — 12-digit regional key identifying a municipality; the primary join key almost everywhere.
- `ags` (Amtlicher Gemeindeschlüssel) — 8-digit official municipality key, derived from `rs`, used only for building komm.one API URLs.
- `election_id` — scoped per `rs` (not globally unique), so most FKs are composite `(election_id, rs)`.
- `party_id` — scoped per `(election_id, rs, votetype_id)`; ballot order/numbering differs between elections, so `party_id` alone does **not** identify a party across elections. Use `party_family_id` (via `election_party_family`) to compare the same party across elections.
- `votetype_id` — distinguishes vote types within one election (e.g. list vote vs. personalized vote), scoped per `(election_id, rs)`.
- `ps_id` (polling station) — scoped per `(election_id, rs)`; can be a postal-only "station".

Raw per-polling-station results live in `election_result`/`election_result_ps`. The
`election_result_aggregate_*` tables (by region/district/polling-station, party or meta/turnout) are
precomputed rollups the map reads from directly rather than aggregating on the fly.

## Commands

See `README.md` for the full dev workflow (`bun install`, `docker compose up -d db`,
`bun run db:migrate`, `bun run dev`). `bun run check` type-checks; `bun run lint`/`format` run
ESLint/Prettier.

### Shareable map links

Every piece of map state a user can change (election, date, Stimme, mode incl. new modes, party,
comparison date, Ebene, focus …) must round-trip through the URL so a copied link reproduces the
view. When adding a mode or control: add it to `src/lib/map/shareUrl.ts` (`ShareState`,
`MODE_SLUGS` / read / write), write it in the `writeShareParams` effect and restore it from `shared`
in `src/routes/+page.svelte`, and extend `scripts/check-share-url.ts`
(`bun run scripts/check-share-url.ts`). Then check the running app's URL actually changes.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
