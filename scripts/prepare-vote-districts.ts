/**
 * One-off (re-run only if a new election's official Wahlkreis-Gemeinden assignment is added) import of
 * the Gemeinde -> Bundestags-/Landtagswahlkreis mapping into small per-date JSON files the scraper reads
 * directly (`src/lib/server/scraper/runCrawl.ts`'s `VOTE_DISTRICT_DATA`, mirroring the existing
 * `stuttgart-districts/*.json` pattern).
 *
 * Without this, `election_vote_district_mapping` was only ever populated for Stuttgart (the one
 * municipality whose Gemeinde straddles more than one Wahlkreis, requiring polling-station-level
 * resolution — see `updateMappingStuttgart`) — every other municipality state-wide had no mapping row at
 * all, so `updateAggregateDistrict`'s "unresolved -> guess from polling-station name" fallback (meant
 * only as a last resort for Stuttgart's own edge cases) silently dumped every other municipality's votes
 * into whichever of its two hardcoded buckets its `else` branch defaults to.
 *
 * Every source below is resolved to our own `rs` via `cities.ags` (the 8-digit Land+RegBez+Kreis+
 * Gemeinde key), never by reassembling the full 12-digit RS from a source file's own Land/RegBez/Kreis/
 * Gemeindeverband/Gemeinde columns — spot-checking against the DB found the federal Bundeswahlleiter
 * exports' "Gemeindeverband" segment doesn't always match Baden-Württemberg's own internal Regional-
 * schlüssel registry (e.g. Böblingen: the BTW25 export's own RGS_GemVerband is "0000", but `cities.rs`
 * has "0003" in that position) — going through the unambiguous, GemVerband-free AGS sidesteps that
 * mismatch entirely.
 *
 * Sources (Land code "08" = Baden-Württemberg throughout):
 * - Bundestagswahl 2025: `btw25_wkr_gemeinden_20241130_utf8.csv` (official Bundeswahlleiter export,
 *   already in the repo) — AGS = `RGS_Land+RGS_RegBez+RGS_Kreis+RGS_Gemeinde`.
 * - Bundestagswahl 2021: `BTW20214Q2020.xls` (already in the repo, legacy .xls binary format) has no
 *   in-repo parser dependency, so it was exported once by hand (see the git history of
 *   `btw21_wkr_gemeinden_utf8.csv`) into the same RS/Nummer shape as the 2025 file — AGS is derived by
 *   dropping the 4-digit Gemeindeverband segment out of its 12-digit RS column.
 * - Landtagswahl 2016 and 2021: `LTWahlkreise2021-BW-wkr_kr_gem_utf8.csv`, downloaded from
 *   statistik-bw.de (https://www.statistik-bw.de/service/karten-und-atlanten/wahlkreiskarten/) — BW's
 *   Landtags-Wahlkreise haven't been redrawn since 1996, so the 2021 assignment is reused for the 2016
 *   election too. Already keyed by AGS ("Gemeindekennziffer") directly.
 *
 * Stuttgart is excluded from every output file: it alone is handled dynamically, per polling station, by
 * `updateMappingStuttgart`.
 *
 * Run with: bun run scripts/prepare-vote-districts.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { cities } from '../src/lib/server/db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../Docker/shiny/data');
const OUT = path.resolve(__dirname, '../src/lib/server/scraper/vote-districts');
mkdirSync(OUT, { recursive: true });

const STUTTGART_RS = 81110000000;

interface VoteDistrictRow {
	rs: number;
	districtId: number;
}

/** Minimal `;`-delimited parser: strips a leading UTF-8 BOM and `#`-comment/blank lines, returns every
 * data row as a `{header: value}` record keyed by the first non-blank, non-comment line. */
const BOM = String.fromCharCode(0xfeff);
function parseSemicolonCsv(file: string): Record<string, string>[] {
	let text = readFileSync(path.join(SRC, file), 'utf-8');
	if (text.startsWith(BOM)) text = text.slice(BOM.length);
	const lines = text
		.split(/\r?\n/)
		.filter((l) => l.replaceAll(';', '').trim() !== '' && !l.trimStart().startsWith('#'));
	const header = lines[0].split(';');
	return lines.slice(1).map((line) => {
		const cells = line.split(';');
		return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
	});
}

function write(name: string, rows: VoteDistrictRow[]) {
	writeFileSync(path.join(OUT, name), JSON.stringify(rows, null, '\t') + '\n');
	console.log(`wrote ${name} (${rows.length} rows)`);
}

if (!process.env.DATABASE_URL)
	throw new Error('DATABASE_URL is not set (needed to resolve ags -> rs)');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle({ client, relations });
const agsToRs = new Map(
	(await db.select({ rs: cities.rs, ags: cities.ags }).from(cities)).map((c) => [c.ags, c.rs])
);

/** Resolves every `{ags, districtId}` pair to `{rs, districtId}`, dropping Stuttgart (handled
 * dynamically elsewhere) and logging anything `cities.ags` doesn't recognise (expected only for
 * gemeindefreie Gebiete with no municipal government at all — see `NO_ELECTION_RS` in `rs.ts`). */
function resolve(pairs: { ags: number; districtId: number; name: string }[]): VoteDistrictRow[] {
	const rows: VoteDistrictRow[] = [];
	const unresolved: string[] = [];
	for (const { ags, districtId, name } of pairs) {
		const rs = agsToRs.get(ags);
		if (rs === undefined) {
			unresolved.push(name);
			continue;
		}
		if (rs === STUTTGART_RS) continue;
		rows.push({ rs, districtId });
	}
	if (unresolved.length > 0)
		console.log(`  ${unresolved.length} unresolved (no matching city.ags):`, unresolved);
	return rows;
}

// --- Bundestagswahl 2025 ---
const btw25 = resolve(
	parseSemicolonCsv('btw25_wkr_gemeinden_20241130_utf8.csv')
		.filter((r) => r['RGS_Land'] === '08')
		.map((r) => ({
			ags: Number(r['RGS_Land'] + r['RGS_RegBez'] + r['RGS_Kreis'] + r['RGS_Gemeinde']),
			districtId: Number(r['Wahlkreis-Nr']),
			name: r['Gemeindename']
		}))
);
write('2025-02-23.json', btw25);

// --- Bundestagswahl 2021 --- (12-digit RS: Land(2)+RegBez(1)+Kreis(2)+GemVerband(4)+Gemeinde(3);
// AGS drops the Gemeindeverband segment, i.e. the middle 4 digits.)
const btw21 = resolve(
	parseSemicolonCsv('btw21_wkr_gemeinden_utf8.csv')
		.filter((r) => r['RS'].startsWith('08'))
		.map((r) => ({
			ags: Number(r['RS'].slice(0, 5) + r['RS'].slice(9)),
			districtId: Number(r['Nummer']),
			name: r['Gemeinde']
		}))
);
write('2021-09-26.json', btw21);

// --- Landtagswahl 2021 (also reused for 2016 — see module doc) ---
const ltw21 = resolve(
	parseSemicolonCsv('LTWahlkreise2021-BW-wkr_kr_gem_utf8.csv').map((r) => ({
		ags: Number(r['Gemeindekennziffer']),
		districtId: Number(r['Wahlkreisnummer']),
		name: r['Gemeindename']
	}))
);
write('2021-03-14.json', ltw21);
write('2016-03-13.json', ltw21);

await client.end();
