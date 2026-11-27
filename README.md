# Wahlergebnisse BW

A public dashboard for election results in Baden-Württemberg, from Gemeinderat up to Bundestag. It has
an interactive map of results by region, a CSV data export, and a password-gated admin page that
crawls new elections.

Built with SvelteKit, TypeScript, Bun, Tailwind CSS, GraphQL ([rumble](https://github.com/m1212e/rumble) +
Pothos + Yoga) and Drizzle ORM against PostgreSQL. German and English UI via
[Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (German is the base locale).

## Status

What works today:

- **Map** (`/`)
  - **Ebenen:** results by Regierungsbezirk, Kreis, Gemeinde and Wahlbezirk. For Bundestags- and
    Landtagswahlen, also by Wahlkreis, including who won each Wahlkreis's mandate(s).
  - **Colouring modes:** Stärkste / Zweitstärkste Partei, Wahlbeteiligung, Hochburg (one party's
    share), Stimmensplitting, Veränderung (change against an earlier election) and Punkte (dot
    density).
  - **Side panel:** results per region, candidate results, and search by place or candidate name.
  - **Share links:** every view can be copied as a link that restores it.
  - **Embedding:** `?embed=1` shows the map alone; the panel's "Einbetten" button copies an iframe
    snippet of the current view. Shared links render a title and description for link previews.
  - **Election night:** while a crawl of the shown election runs (or the admin schedule covers
    now), the map shows "Auszählung läuft" and offers to load newer results; embeds reload by
    themselves.
- **Gemeinde pages** (`/gemeinde/[rs]`): every election in one municipality: latest result with
  seats, a trend chart per party family, turnout over time, the current Gemeinderat and its
  Listenspringer. Listed in `/sitemap.xml`.
- **Candidate pages** (`/kandidat/[name]`): every Gemeinderat/Kreistag candidacy under a name, with
  list position, votes, rank within the list and whether elected.
- **Listenspringer** (`/listenspringer`): how many Gemeinderat seats went to candidates from
  further down their list, the biggest jumps and the Gemeinden with the most.
- **About, Impressum, Datenschutz** (`/ueber`, `/impressum`, `/datenschutz`), linked from the map's
  side panel and every other page. The About page credits every data source below.
- **Data export** (`/daten`): CSV of turnout, party or candidate results per Gemeinde or per
  polling district, and polling-station metadata, for any selection of Gemeinden.
  `/daten/export/<electionType>/<date>.zip` is a fixed link per election: every file for every
  Gemeinde with results, plus a `QUELLEN.txt` with the sources and the data status.
- **Admin** (`/admin`, password from `ADMIN_PASSWORD`): starts a crawl for one election date and
  type, with live per-city progress. It runs the discovery, results, open-data import and
  aggregation steps in order. `/admin/qualitaet` checks an election for missing or inconsistent
  data; `/admin/zeitplan` re-runs a crawl on a schedule for election night This needs a single server
  instance, because the scheduler and the crawl lock live in the process.

Wahlbezirk boundaries exist only where a city publishes them. That means Stuttgart (every election
with a boundary file, see below), plus 10 cities for the Landtagswahl 2026.

The crawler has been run for these elections (development database, September 2026; Gemeinden
with results). No database ships with the app, so a new deployment starts empty, see
[Deploying](#deploying):

| Date       | Election                                                  | Gemeinden                 |
| ---------- | --------------------------------------------------------- | ------------------------- |
| 13.03.2016 | Landtagswahl                                              | 776                       |
| 26.05.2019 | Europawahl, Kreistagswahl, Gemeinderatswahl, Regionalwahl | 1.037 / 1.061 / 629 / 169 |
| 14.03.2021 | Landtagswahl                                              | 1.101                     |
| 26.09.2021 | Bundestagswahl                                            | 1.094                     |
| 09.06.2024 | Europawahl, Kreistagswahl, Gemeinderatswahl, Regionalwahl | 1.094 / 1.092 / 935 / 172 |
| 23.02.2025 | Bundestagswahl                                            | 1.097                     |
| 08.03.2026 | Landtagswahl                                              | 1.101                     |

Gemeinderats- and Regionalwahl counts are lower because not every Gemeinde publishes those
elections on komm.one.

**Known issues / still open**

- Stuttgart's Wahlbezirk turnout for 13.03.2016 and 26.05.2019 is too low. No postal-to-urn
  district mapping exists for those dates, so each Bezirk counts only its urn voters.

## Data sources

### Election results

- **komm.one / votemanager** ([wahlergebnisse.komm.one](https://wahlergebnisse.komm.one)): the main
  source. Most Gemeinden publish their results through Komm.ONE's votemanager. The crawler reads its
  JSON API (election dates, polling stations, results per polling station, candidates, elected
  members), see `src/lib/server/scraper/`.
- **komm.one html5 open-data exports**: CSVs from the same portal, used for Gemeinden or elections
  that the JSON API doesn't cover or leaves empty (e.g. Landtagswahl 2016), see `html5OpenData.ts`.
- **Kreis open data on komm.one**: for small Gemeinden that don't publish on their own; their
  Landkreis publishes Gemeinde-level CSVs instead, see `kreisOpenData.ts`.
- **Statistisches Landesamt Baden-Württemberg**, Landtagswahl 2026
  ([wahlen.statistik-bw.de/ltw26](https://wahlen.statistik-bw.de/ltw26/)): the statewide results
  CSV down to every Urnen- and Briefwahlbezirk, the list of elected members, and the per-Wahlkreis
  result pages that name the candidates. komm.one no longer serves Landtagswahlen through its API
  from 2026 on, see `statistikBw.ts`.

### Mandates (who represents each Wahlkreis)

Built once per election by `scripts/prepare-{bundestag,landtag}-mandates.ts` into
`src/lib/server/map/mandates/<date>.json`:

- **Die Bundeswahlleiterin** ([bundeswahlleiterin.de](https://www.bundeswahlleiterin.de/bundestagswahlen/)):
  Wahlkreis results (`kerg2.csv`) and the list of elected members. © Die Bundeswahlleiterin,
  Datenlizenz Deutschland – Namensnennung 2.0.
- **Deutscher Bundestag**: master data of all members ("MdB-Stammdaten",
  [bundestag.de/services/opendata](https://www.bundestag.de/services/opendata)).
- **Landeszentrale für politische Bildung BW** ([landtagswahl-bw.de](https://www.landtagswahl-bw.de/)):
  "Abgeordnete nach Wahlkreisen" for the Landtagswahlen up to 2021.
- **Statistisches Landesamt BW**: elected members of the Landtagswahl 2026 (see above).

### Boundaries

Built by `scripts/prepare-geo-data.ts` and `scripts/prepare-wahlbezirke.ts` into `src/lib/geo/`:

- **OpenStreetMap**: Regierungsbezirk, Kreis and Gemeinde boundaries
  (`Baden_Wuerttemberg_small.geojson`) and Bundestagswahlkreise
  (`Bundestag.geojson`), exported via Overpass. © OpenStreetMap contributors, ODbL. The map's
  base tiles are also from OpenStreetMap.
- **Statistisches Landesamt BW**, Wahlkreiskarten
  ([statistik-bw.de](https://www.statistik-bw.de/service/karten-und-atlanten/wahlkreiskarten/)):
  - The Landtagswahlkreise (`Landtag_BW.geojson`, identical to `LTWahlkreise2021-BW.geojson`).
  - The Gemeinde-to-Landtagswahlkreis assignment (`LTWahlkreise2021-BW-wkr_kr_gem.csv`).
  - Required notice: "© Statistisches Landesamt Baden-Württemberg, Stuttgart 2020. Kartengrundlage:
    LGL (www.lgl-bw.de), Stadt Freiburg, Stadt Karlsruhe, Stadt Mannheim, Landeshauptstadt Stuttgart".
- **Landeshauptstadt Stuttgart, Statistisches Amt**
  ([stuttgart.de/…/wahldaten](https://www.stuttgart.de/service/wahlen/wahldaten/wahldaten)):
  Stuttgart's Wahlbezirk shapefiles (`Stuttgart_Bezirke_<year>.geojson`) and their postal-to-urn
  district assignment. Free for non-commercial use with the notice "© Landeshauptstadt
  Stuttgart/Statistisches Amt".
- **komm.one result presentations**: Wahlbezirk boundaries and Briefwahlbezirk assignments of the
  10 cities that publish them for the Landtagswahl 2026 (`scripts/prepare-wahlbezirke.ts`).

### Reference data

- **Zensus 2022**, table 1000A-0000 "Bevölkerung kompakt" (as of 15.05.2022, Statistische Ämter
  des Bundes und der Länder): the list of Gemeinden with Regionalschlüssel and population, seeded
  from `src/lib/server/db/seed/data/cities.csv`.
- **Gemeinde-to-Bundestagswahlkreis assignment** (`scripts/prepare-vote-districts.ts`):
  - 2025: `btw25_wkr_gemeinden` CSV from Die Bundeswahlleiterin.
  - 2021: Statistisches Bundesamt, Gemeindeverzeichnis GV-ISys, 4. Quartal 2020
    (`BTW20214Q2020.xls`).
- **Party families** (`party-families.csv`: names and map colours): curated by this project.

## Developing

```sh
cp .env.example .env   # then fill in real values

# start a local Postgres for development (this compose file is for local dev/testing only;
# the deployed image is built by .github/workflows/publish-image.yml)
docker compose up -d db

bun install
bun run db:migrate   # apply the schema to your local Postgres
bun run db:seed      # load reference data (cities, party families, election types)
bun run dev -- --open
```

Other useful scripts: `bun run check` (type-check), `bun run lint` / `bun run format`
(Prettier + ESLint), `bun run db:generate` (create a new migration after changing
`src/lib/server/db/schema.ts`), `bun run db:studio` (browse the local database), `bun run db:seed`
(idempotent, so re-run it any time to refresh reference data; source CSVs live in
`src/lib/server/db/seed/data/`).

To regenerate the typed GraphQL client (`src/lib/generated-client/`) after changing
`src/lib/server/graphql/index.ts`'s query/mutation fields: start `bun run dev`, then hit
`GET /dev/generate-graphql-client` (dev-only route). Afterwards, re-apply the small manual patch
documented at the top of `src/lib/generated-client/client.ts` (the codegen currently omits
`Mutation`/`Subscription` type aliases when the schema defines neither, which is harmless while the
schema has no mutations).

To add or change UI text, edit `messages/de.json` (base locale) and `messages/en.json`, then use it
in a component via `import * as m from '#lib/paraglide/messages.js'; m.your_key()`. `src/lib/paraglide/`
is generated by the Vite plugin (gitignored, rebuilt automatically on `dev`/`build`). Never edit it
by hand. Internal domain vocabulary used as API/query values (e.g. `MapMode`/`MapInformationMode`
literals like `"Kreis"`, `"Hochburg"`) stays German throughout the codebase; only the _displayed_
labels are translated (see `mapModeLabel`/`visualModeLabel` in `src/routes/+page.svelte`).

> **Known issue:** drizzle-orm and drizzle-kit are pinned to a `1.0.0-rc.*` pre-release because
> `rumble` depends on Drizzle v1's relations API. drizzle-kit's bundled CLI currently fails under Bun
> with `Could not resolve: "node:sqlite"`: it eagerly imports a dialect we don't use, and Bun 1.3.9
> doesn't implement that built-in. Until a newer drizzle-kit RC or Bun release fixes this, run
> `db:generate`/`db:migrate`/`db:push`/`db:studio` with **Node ≥ 22.5** instead of Bun, e.g.
> `node node_modules/drizzle-kit/bin.cjs generate`. The app itself runs fine on Bun; only the
> drizzle-kit CLI is affected.

> **Patched dependency**: `@m1212e/rumble` is patched (see `patches/`, applied automatically by
> `bun install` via `patchedDependencies` in `package.json`) to fix a missing `bigint` SQL-type case
> in its ability-filter internals. Our schema uses `bigint` extensively (`rs`, `ags`). If upgrading
> `@m1212e/rumble`, check whether upstream has fixed this before re-patching.

## Building

```sh
bun run build
bun run preview   # preview the production build locally
```

The production image is a multi-stage Bun build (see `Dockerfile`). To test that image itself
locally (rather than the `bun run dev` server), `docker-compose.yaml` also has an `app` service:

```sh
docker compose up -d db
bun run db:migrate   # still required, the app container doesn't run migrations on startup
docker compose up --build app
```

This serves the app at `http://localhost:3000`. There's no hot reload, so rebuild with
`docker compose up --build app` after code changes. It's meant for verifying the container build,
not for day-to-day development.

## Deploying

The image published by `.github/workflows/publish-image.yml` (on pushes to `main` and `v*` tags)
contains only the built app, with no database and no election results. The boundary files and mandate JSONs
under `src/lib/` are bundled into the build; everything else lives in PostgreSQL. To set up a new
deployment:

1. Provide a PostgreSQL database and set `DATABASE_URL`, `ADMIN_PASSWORD` and `SESSION_SECRET` for
   the container, plus `OPERATOR_NAME`, `OPERATOR_ADDRESS` and `OPERATOR_EMAIL` for the Impressum and
   Datenschutz pages. They are read at runtime and kept out of the repo, see `.env.example`.
2. From a checkout of this repo, with `DATABASE_URL` pointing at that database, run
   `bun run db:migrate` and `bun run db:seed`. The container does neither on startup.
3. Log in at `/admin` and crawl each election you want to show. The crawl also runs the open-data
   and Statistisches Landesamt imports.
4. Behind a reverse proxy, set adapter-node's `ORIGIN` (link previews, `sitemap.xml`) and
   `ADDRESS_HEADER` (the admin login's per-IP lockout).

Operating notes:

- The image runs as the unprivileged `bun` user and has a Docker `HEALTHCHECK` on `/healthz`, which
  answers 200 while the app reaches its database and 503 otherwise.
- Admin sessions are stateless signed cookies valid for 24 hours. There is no session store, so the
  only way to log every session out at once (e.g. after a leaked password) is to change
  `SESSION_SECRET` and restart.
- At most three CSV/ZIP exports stream at once; further requests get a 503 with `Retry-After`.
- Per-client rate limits (429 with `Retry-After`): `/graphql` 120 requests at once then 2/s,
  `/daten/export` 10 then 1/minute, `/api/kandidaten` 30 then 1/s. They need the real client IP:
  behind a reverse proxy set `ADDRESS_HEADER` (e.g. `X-Forwarded-For`, plus `XFF_DEPTH` for more
  than one proxy). Requests from private addresses, which is what the proxy looks like without it,
  are never limited, so a missing `ADDRESS_HEADER` can't throttle all visitors together.

A database crawled before the candidate pages existed needs two one-off backfills:
`bun run scripts/build-candidates.ts` (per-candidate table for Gemeinderat/Kreistag) and
`bun run scripts/fetch-kreistag-elected.ts <date>` per Kreistagswahl (elected members, published
per Landkreis and fetched from komm.one). New crawls do both themselves.

## History

This project began as part of a master's thesis ("Do names matter in local elections?").

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).
You may use, change and share it, including commercially, as long as everything you build on it
stays under the AGPL. That includes running a modified version as a website: its users must be able
to get its source code (the footer's "Quellcode" link points to this repository; change
`SOURCE_URL` in `src/lib/components/SiteLinks.svelte` if you deploy a fork).

The license covers the code only. The election results, boundaries and other data belong to their
sources and stay under their terms (listed on the site's "Über das Projekt" page): for example
OpenStreetMap boundaries under the ODbL and the Bundeswahlleiterin's data under the Datenlizenz
Deutschland – Namensnennung 2.0.
