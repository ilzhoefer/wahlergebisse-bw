import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	electionsVotetypes,
	electionParty,
	electionPartyFamily,
	electionResult,
	electionResultPs,
	electionVoteDistrictMapping,
	pollingStations
} from '$lib/server/db/schema';
import { BASE, formatDateForUrl, padAgs, runWithConcurrency, type Logger } from './client';
import { setElectionType } from './elections';
import { parseOpenDataCsv } from './kreisOpenData';

type Db = typeof DbType;

// Latin-1 named entities (&#160;–&#255;, in code point order) — votemanager's html5 pages encode every
// umlaut and accent this way ("GR&Uuml;NE", "Dr. Me&szlig;mer").
const LATIN1 =
	'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(
		' '
	);
const ENTITIES: Record<string, string> = {
	amp: '&',
	quot: '"',
	apos: "'",
	lt: '<',
	gt: '>',
	ndash: '–',
	mdash: '–',
	...Object.fromEntries(LATIN1.map((n, i) => [n, String.fromCharCode(160 + i)]))
};

export function decodeEntities(s: string): string {
	return s
		.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
			e[0] !== '#'
				? (ENTITIES[e] ?? m)
				: String.fromCodePoint(
						e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)
					)
		)
		.trim();
}

export interface Html5Wahl {
	title: string;
	/** komm.one's election id — the same one the JSON API uses where a Gemeinde has both. */
	electionId: number;
	resultPage: string;
}

/** The elections of a Wahltermin, from the "Wahlen" menu of the html5 index page. */
export function parseWahlen(indexHtml: string): Html5Wahl[] {
	const seen = new Map<number, Html5Wahl>();
	// "Landtagswahl_BW_2021_Land_BW_172_Stadt_Aalen.html": the id is the last number segment (the one
	// after the Wahlgebiet); the rest of the name varies per Gemeinde. Menu links to other pages
	// (index.html, OpenDataInfo.html, ../…) have no number segment.
	for (const m of indexHtml.matchAll(
		/<a href="([^"/]+\.html)"\s+class="dropdown-item"\s*>([^<]+)/g
	)) {
		const id = [...m[1].matchAll(/_(\d+)_/g)].at(-1)?.[1];
		if (id) seen.set(+id, { title: decodeEntities(m[2]), electionId: +id, resultPage: m[1] });
	}
	return [...seen.values()];
}

/** "Stadt Esslingen am Neckar" — the page header's Behörde. */
export function parseBehoerde(indexHtml: string): string | null {
	const m = /class="header_subtitle"\s*>([^<]+)/.exec(indexHtml);
	return m ? decodeEntities(m[1]) : null;
}

/** OpenDataInfo.html's table: which CSV holds which Ebene of which Wahl. */
export function parseOpenDataFiles(infoHtml: string) {
	const flat = infoHtml.replace(/\s*\n\s*/g, '');
	return [
		...flat.matchAll(/<tr><td>([^<]*)<\/td><td><a href="([^"]+\.csv)"[^>]*title="([^"]*)"/g)
	].map((m) => ({ wahl: decodeEntities(m[1]), url: m[2], ebene: decodeEntities(m[3]) }));
}

export interface ResultRow {
	label: string;
	color: string;
	votes: number;
}

/** The result table of an html5 result page: "Musterfrau, GRÜNE" / colour / votes, in ballot order. */
export function parseResultRows(html: string): ResultRow[] {
	const flat = html.replace(/\s*\n\s*/g, '');
	const rows: ResultRow[] = [];
	for (const m of flat.matchAll(
		/background-color:\s*(#[0-9a-fA-F]{3,6});border:solid 1px #dadada"\s*><\/div><\/td><td>([^<]*)<\/td><td class="text-right"\s*><nobr>([\d.]+)</g
	)) {
		const label = decodeEntities(m[2]);
		if (rows.some((r) => r.label === label)) break; // a second table (e.g. a comparison) starts
		rows.push({ label, color: m[1].toLowerCase(), votes: +m[3].replaceAll('.', '') });
	}
	return rows;
}

/** Per-Wahlkreis result pages of a Gemeinde spanning several Wahlkreise (Stuttgart, Mannheim, …). */
export function parseWahlkreisPages(html: string): Map<string, string> {
	const pages = new Map<string, string>();
	for (const m of html.matchAll(/href="([^"]*_Wahlkreis_Wahlkreis_(\d+)_[^"]*\.html)"/g))
		pages.set(m[2], m[1]);
	return pages;
}

type CsvRow = Record<string, string>;
const dColumns = (row: CsvRow) => Object.keys(row).filter((k) => /^D\d+$/.test(k));
const int = (s: string | undefined) => (s ? Number(s) : 0);

/**
 * Assigns ballot labels to the CSV's vote columns: a result page lists exactly the columns that carry
 * a value in its area, in column order. Returns null when the counts disagree.
 */
export function matchColumns(stations: CsvRow[], rows: ResultRow[]) {
	if (stations.length === 0) return null;
	const cols = dColumns(stations[0]).filter((c) => stations.some((s) => s[c] !== ''));
	if (cols.length !== rows.length) return null;
	const mismatches = cols.filter(
		(c, i) => stations.reduce((sum, s) => sum + int(s[c]), 0) !== rows[i].votes
	).length;
	return { byColumn: new Map(cols.map((c, i) => [c, rows[i]])), mismatches };
}

async function fetchText(url: string): Promise<string | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
			if (res.status === 404) return null;
			if (res.ok) return await res.text();
		} catch {
			// timeout / network hiccup — retry
		}
	}
	return null;
}

/**
 * Older Wahltermine (Landtagswahl 2016/2021 in ~1000 Gemeinden) exist on komm.one only as votemanager's
 * static "html5" export — no JSON API, so the regular steps find nothing. This imports them from the
 * export's open-data CSVs instead, for every city still without results for this election type/date:
 *
 * 1. html5/index.html lists the Wahlen (with komm.one's election id); each gets an `elections` row like
 *    the JSON discovery would write, then `setElectionType` classifies them.
 * 2. Per Wahl of the crawled type: the "Wahlbezirk" CSV has one row per polling station (A eligible,
 *    B voters, C invalid, D valid, D<n> votes per ballot column); `opendata-wahllokale.csv` adds each
 *    station's address, accessibility and whether it's a postal district ("B").
 * 3. Ballot labels ("Musterfrau, GRÜNE") and colours come from the result page, whose rows are the
 *    non-empty D columns in order (checked against the summed station votes). Gemeinden spanning
 *    several Wahlkreise have different candidates per Wahlkreis — labels then come from each
 *    Wahlkreis's page, for the stations its "Bezirke (Wahlkreis: NN)" CSV lists.
 *
 * Only the single-vote format (one D block) is understood — others are skipped with a log line.
 */
export async function importHtml5OpenData(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	electionTypeId: number,
	log: Logger,
	parallel: number
) {
	const withResults = new Set(
		(
			await db
				.selectDistinct({ rs: elections.rs })
				.from(elections)
				.innerJoin(
					electionResultPs,
					and(
						eq(electionResultPs.electionId, elections.electionId),
						eq(electionResultPs.rs, elections.rs)
					)
				)
				.where(
					and(
						eq(elections.date, date),
						eq(elections.electionType, electionTypeId),
						// Numbers, not just rows — the JSON API returns some 2016 stations without any.
						isNotNull(electionResultPs.validBallots)
					)
				)
		).map((r) => r.rs)
	);
	const missing = cityList.filter((c) => !withResults.has(c.rs));
	const existing = await db
		.select({ rs: elections.rs, electionId: elections.electionId, name: elections.electionName })
		.from(elections)
		.where(eq(elections.date, date));

	const base = (ags: number) => `${BASE}/wahltermin-${formatDateForUrl(date)}/${padAgs(ags)}/html5`;
	const found = new Map<number, Html5Wahl[]>();
	const kreis = kreisExports(date);
	let done = 0;
	await runWithConcurrency(missing, parallel, async (city) => {
		const label = city.name ?? String(city.rs);
		const index = await fetchText(`${base(city.ags)}/index.html`);
		let wahlen = index ? parseWahlen(index) : [];
		const names = new Map(wahlen.map((w) => [w.title, (index && parseBehoerde(index)) ?? label]));
		if (wahlen.length === 0)
			// No export of its own (e.g. Göppingen 2016) — its Landkreis's may still list its stations.
			for (const k of await kreisWahlenOf(kreis, city.ags)) {
				wahlen = [...wahlen, { title: k.title, electionId: k.electionId, resultPage: '' }];
				names.set(k.title, k.gemeinden.get(padAgs(city.ags)) ?? label);
			}
		const own = existing.filter((e) => e.rs === city.rs);
		for (const w of wahlen) {
			// Already known (e.g. from the JSON API) — keep that row and its election id.
			if (own.some((e) => e.name?.startsWith(w.title))) continue;
			if (own.some((e) => e.electionId === w.electionId)) {
				log(
					`${label}: Wahl-ID ${w.electionId} ("${w.title}") schon anderweitig belegt, überspringe`,
					undefined,
					'warn'
				);
				continue;
			}
			await db
				.insert(elections)
				.values({
					electionId: w.electionId,
					rs: city.rs,
					date,
					electionName: `${w.title} - ${names.get(w.title)}`
				})
				.onConflictDoNothing();
		}
		if (wahlen.length > 0) found.set(city.rs, wahlen);
		log(`${label}: ${wahlen.length} Wahl(en) im html5-Export`, {
			level: 'city',
			index: ++done,
			total: missing.length,
			label,
			rs: city.rs,
			cityStatus: wahlen.length > 0 ? 'done' : 'skipped'
		});
	});
	if (found.size === 0) return log('html5-Export: keine fehlenden Gemeinden gefunden');
	await setElectionType(db, log);

	const targets = await db
		.select({ rs: elections.rs, electionId: elections.electionId, name: elections.electionName })
		.from(elections)
		.where(
			and(
				eq(elections.date, date),
				eq(elections.electionType, electionTypeId),
				inArray(elections.rs, [...found.keys()])
			)
		);
	const cityByRs = new Map(cityList.map((c) => [c.rs, c]));
	let imported = 0;
	let failed = 0;
	done = 0;
	const retry: typeof targets = [];
	const importTarget = async (t: (typeof targets)[number], last: boolean) => {
		const city = cityByRs.get(t.rs)!;
		const label = city.name ?? String(city.rs);
		const wahl = found.get(t.rs)!.find((w) => t.name?.startsWith(w.title));
		const error = wahl
			? await importElection(
					db,
					base(city.ags),
					{ ...t, ags: city.ags, date, electionTypeId },
					wahl,
					label,
					log,
					kreis
				)
			: 'Wahl nicht im html5-Export';
		if (!error) imported++;
		// Borrowed labels (see wahlkreisLabels) need the Wahlkreis's other Gemeinden imported first.
		else if (!last) retry.push(t);
		else {
			failed++;
			log(`${label}: ${error}`, undefined, 'warn');
		}
		return error;
	};
	await runWithConcurrency(targets, parallel, async (t) => {
		const city = cityByRs.get(t.rs)!;
		const label = city.name ?? String(city.rs);
		const error = await importTarget(t, false);
		log('', {
			level: 'city',
			index: ++done,
			total: targets.length,
			label,
			rs: t.rs,
			cityStatus: error ? 'skipped' : 'done'
		});
	});
	for (const t of retry) await importTarget(t, true);
	log(`html5-Export: ${imported} Gemeinden übernommen, ${failed} nicht übernehmbar`);
}

type Group = { stations: CsvRow[]; rows: ResultRow[]; districtId?: number };
type StationSource = { stations: CsvRow[]; groups: Group[]; wahlkreisOf: Map<string, number> };
type Target = { rs: number; ags: number; electionId: number; date: string; electionTypeId: number };

const wahlkreisFiles = (files: { ebene: string; url: string }[]) =>
	files.flatMap((f) => {
		const nr = /^Bezirke \(Wahlkreis: (\d+)\)$/.exec(f.ebene)?.[1];
		return nr ? [{ nr, url: f.url }] : [];
	});

/** Wahlkreis number → page html, following the Wahlkreis links from `html` — not every page links
 * every Wahlkreis (Karlsruhe's Gemeinde page only links "Karlsruhe I", which links "Karlsruhe II"). */
async function loadWahlkreisPages(base: string, html: string): Promise<Map<string, string>> {
	const pages = parseWahlkreisPages(html);
	const htmlOf = new Map<string, string>();
	for (let next; (next = [...pages].find(([nr]) => !htmlOf.has(nr)));) {
		const page = await fetchText(`${base}/${next[1]}`);
		htmlOf.set(next[0], page ?? '');
		if (page) for (const [nr, link] of parseWahlkreisPages(page)) pages.set(nr, link);
	}
	return htmlOf;
}

/** One Wahl in a Landkreis's html5 export: the stations of all its Gemeinden (with their `ags`) per
 * Wahlkreis, with that Wahlkreis's ballot labels, plus each Gemeinde's name. */
interface KreisWahl {
	title: string;
	electionId: number;
	gemeinden: Map<string, string>;
	wahlkreise: { nr: number; stations: CsvRow[]; rows: ResultRow[] }[];
}
type KreisExports = (kreisAgs: string) => Promise<KreisWahl[]>;

/** Loads each Landkreis's export once per crawl (all its Gemeinden share it). */
function kreisExports(date: string): KreisExports {
	const cache = new Map<string, Promise<KreisWahl[]>>();
	return (kreisAgs) => {
		const base = `${BASE}/wahltermin-${formatDateForUrl(date)}/${kreisAgs}/html5`;
		if (!cache.has(kreisAgs)) cache.set(kreisAgs, loadKreisWahlen(base));
		return cache.get(kreisAgs)!;
	};
}

async function loadKreisWahlen(base: string): Promise<KreisWahl[]> {
	const [index, info] = await Promise.all([
		fetchText(`${base}/index.html`),
		fetchText(`${base}/OpenDataInfo.html`)
	]);
	if (!index || !info) return [];
	const files = parseOpenDataFiles(info);
	const out: KreisWahl[] = [];
	for (const w of parseWahlen(index)) {
		const own = files.filter((f) => f.wahl === w.title);
		const wkFiles = wahlkreisFiles(own);
		const resultHtml = wkFiles.length > 0 ? await fetchText(`${base}/${w.resultPage}`) : null;
		const htmlOf = resultHtml ? await loadWahlkreisPages(base, resultHtml) : new Map();
		const wahlkreise = [];
		for (const { nr, url } of wkFiles) {
			const csv = await fetchText(`${base}/${url}`);
			wahlkreise.push({
				nr: Number(nr),
				stations: csv ? parseOpenDataCsv(csv) : [],
				rows: parseResultRows(htmlOf.get(nr) ?? '')
			});
		}
		const gemeindeFile = own.find((f) => f.ebene === 'Gemeinde');
		const gemeindeCsv = gemeindeFile ? await fetchText(`${base}/${gemeindeFile.url}`) : null;
		const gemeinden = new Map(
			(gemeindeCsv ? parseOpenDataCsv(gemeindeCsv) : []).map((r) => [r.ags, r['gebiet-name']])
		);
		out.push({ title: w.title, electionId: w.electionId, gemeinden, wahlkreise });
	}
	return out;
}

const kreisAgsOf = (ags: number) => padAgs(ags).slice(0, 5) + '000';

/** The Kreis export's Wahlen that list stations of this Gemeinde (none for a Stadtkreis). */
async function kreisWahlenOf(kreis: KreisExports, ags: number): Promise<KreisWahl[]> {
	if (kreisAgsOf(ags) === padAgs(ags)) return [];
	return (await kreis(kreisAgsOf(ags))).filter((k) =>
		k.wahlkreise.some((w) => w.stations.some((s) => s.ags === padAgs(ags) && s.D !== ''))
	);
}

/** Stations from the Gemeinde's own export — see importHtml5OpenData. */
async function ownStations(
	db: Db,
	base: string,
	t: Target,
	wahl: Html5Wahl,
	label: string,
	log: Logger
): Promise<StationSource | string> {
	const info = await fetchText(`${base}/OpenDataInfo.html`);
	if (!info) return 'OpenDataInfo.html fehlt';
	const files = parseOpenDataFiles(info).filter((f) => f.wahl === wahl.title);
	const stationFile = files.find((f) => f.ebene === 'Wahlbezirk');
	if (!stationFile) return `keine Wahlbezirk-CSV für "${wahl.title}"`;

	const csv = await fetchText(`${base}/${stationFile.url}`);
	const stations = csv ? parseOpenDataCsv(csv).filter((r) => r['gebiet-nr'] !== undefined) : [];
	if (stations.length === 0) return 'Wahlbezirk-CSV leer';
	if (stations.every((s) => s.D === '')) return 'Wahlbezirk-CSV ohne Ergebnisse';
	if (!('D' in stations[0]) || Object.keys(stations[0]).some((k) => /^[EF]\d*$/.test(k)))
		return 'nicht unterstütztes CSV-Format (nicht Ein-Stimmen-Format)';

	// Labels per station: from each Wahlkreis's page where the Gemeinde spans several, else the
	// Gemeinde's own result page.
	const resultHtml = await fetchText(`${base}/${wahl.resultPage}`);
	if (!resultHtml) return 'Ergebnisseite fehlt';
	// The official Gemeinde → Wahlkreis assignment — several for Stuttgart, Karlsruhe, Freiburg, …
	const cityDistricts = (
		await db
			.selectDistinct({ districtId: electionVoteDistrictMapping.districtId })
			.from(electionVoteDistrictMapping)
			.where(
				and(
					eq(electionVoteDistrictMapping.rs, t.rs),
					eq(electionVoteDistrictMapping.electionType, t.electionTypeId),
					eq(electionVoteDistrictMapping.date, t.date),
					isNull(electionVoteDistrictMapping.psId)
				)
			)
	).flatMap((r) => (r.districtId === null ? [] : [r.districtId]));
	const groups: Group[] = [];
	const wahlkreisOf = new Map<string, number>();
	const wkFiles = wahlkreisFiles(files);
	if (wkFiles.length > 1 || (wkFiles.length > 0 && cityDistricts.length > 1)) {
		const htmlOf = await loadWahlkreisPages(base, resultHtml);
		for (const { nr, url } of wkFiles) {
			const wkCsv = await fetchText(`${base}/${url}`);
			if (!wkCsv) return `Wahlkreis ${nr}: Bezirks-CSV fehlt`;
			const nrs = new Set(parseOpenDataCsv(wkCsv).map((r) => r['gebiet-nr']));
			const wkStations = stations.filter((s) => nrs.has(s['gebiet-nr']));
			wkStations.forEach((s) => wahlkreisOf.set(s['gebiet-nr'], Number(nr)));
			groups.push({
				stations: wkStations,
				rows: parseResultRows(htmlOf.get(nr) ?? ''),
				districtId: Number(nr)
			});
		}
	}
	const rest = stations.filter((s) => !wahlkreisOf.has(s['gebiet-nr']));
	if (rest.length > 0) {
		// Stations no Wahlkreis CSV lists (Freiburg publishes only "Freiburg II"'s) belong to the
		// Gemeinde's one remaining Wahlkreis, where that's unambiguous.
		const left = cityDistricts.filter((d) => ![...wahlkreisOf.values()].includes(d));
		const districtId = left.length === 1 ? left[0] : undefined;
		if (wahlkreisOf.size > 0) {
			if (districtId === undefined) {
				// A station without a Wahlkreis would drop into updateAggregateDistrict's Stuttgart
				// guess — rather keep the whole-Gemeinde assignment.
				log(
					`${label}: Wahlkreis nicht für alle Wahlbezirke bestimmbar, keine Zuordnung je Bezirk`,
					undefined,
					'warn'
				);
				wahlkreisOf.clear();
			} else rest.forEach((s) => wahlkreisOf.set(s['gebiet-nr'], districtId));
		}
		groups.push({ stations: rest, rows: parseResultRows(resultHtml), districtId });
	}
	return { stations, groups, wahlkreisOf };
}

/** Stations from the Landkreis's export, for a Gemeinde whose own is missing or blank (many 2016
 * exports list every station but no numbers). */
async function kreisStations(
	kreis: KreisExports,
	t: Target,
	wahl: Html5Wahl
): Promise<StationSource | null> {
	const k = (await kreisWahlenOf(kreis, t.ags)).find((w) => w.title === wahl.title);
	const groups = (k?.wahlkreise ?? [])
		.map((w) => ({
			stations: w.stations.filter((s) => s.ags === padAgs(t.ags)),
			rows: w.rows,
			districtId: w.nr
		}))
		.filter((g) => g.stations.length > 0);
	if (groups.length === 0) return null;
	const wahlkreisOf = new Map<string, number>();
	if (groups.length > 1)
		for (const g of groups)
			for (const s of g.stations) wahlkreisOf.set(s['gebiet-nr'], g.districtId);
	return { stations: groups.flatMap((g) => g.stations), groups, wahlkreisOf };
}

/** Imports one Wahl of one Gemeinde; returns an error message instead of throwing. */
async function importElection(
	db: Db,
	base: string,
	t: Target,
	wahl: Html5Wahl,
	label: string,
	log: Logger,
	kreis: KreisExports
): Promise<string | null> {
	const own = await ownStations(db, base, t, wahl, label, log);
	const source = typeof own === 'string' ? await kreisStations(kreis, t, wahl) : own;
	if (!source) return own as string;
	const viaKreis = source !== own;
	const { stations, groups, wahlkreisOf } = source;

	const labelOf = new Map<CsvRow, Map<string, ResultRow>>();
	let mismatches = 0;
	for (const g of groups) {
		// Where a page lists no candidates — empty (a few Gemeinden) or party names (the overall page of
		// a Gemeinde spanning several Wahlkreise; only independents appear as "Name, Partei" there) — borrow those of the Wahlkreis: from its
		// other Gemeinden already imported, else from the Landkreis's page of that Wahlkreis.
		let rows = g.rows;
		const candidates = rows.length > 0 && rows.every((r) => r.label.includes(', '));
		if (!candidates && g.districtId !== undefined) {
			const fromKreis = async () =>
				kreisAgsOf(t.ags) === padAgs(t.ags)
					? []
					: ((await kreis(kreisAgsOf(t.ags)))
							.find((k) => k.title === wahl.title)
							?.wahlkreise.find((w) => w.nr === g.districtId)?.rows ?? []);
			const borrowed = await wahlkreisLabels(db, g.districtId, t, g.stations);
			const kreisRows = borrowed.length > 0 ? [] : await fromKreis();
			if (borrowed.length > 0) rows = borrowed;
			else if (kreisRows.length > 0) rows = kreisRows;
		}
		const match = matchColumns(g.stations, rows);
		if (!match)
			return `Stimmspalten (${g.stations.length} Bezirke) passen nicht zu ${rows.length} Ergebniszeilen`;
		// Borrowed labels carry other areas' votes — their sums say nothing about this Gemeinde.
		if (rows === g.rows) mismatches += match.mismatches;
		for (const s of g.stations) labelOf.set(s, match.byColumn);
	}
	// Mismatching sums mean the Wahlbezirk CSV lacks some votes (e.g. postal districts published only
	// elsewhere) — the stations are still right, the Gemeinde total is short. (A Kreis export's labels
	// come with its whole Wahlkreis's votes, so there they never match.)
	if (mismatches > 0 && !viaKreis)
		log(
			`${label}: Summe der Wahlbezirke weicht bei ${mismatches} Stimmspalten vom Gesamtergebnis ab`,
			undefined,
			'warn'
		);

	const lokaleCsv = await fetchText(`${base}/opendata-wahllokale.csv`);
	const lokale = new Map(
		(lokaleCsv ? parseOpenDataCsv(lokaleCsv) : []).map((r) => [r['Bezirk-Nr'], r])
	);

	// Numeric station ids from "900-01" → 90001; the row number if that isn't unique.
	const digitIds = stations.map((s) => Number(s['gebiet-nr'].replace(/\D/g, '')) || 0);
	const psIds =
		new Set(digitIds).size === digitIds.length ? digitIds : stations.map((_, i) => i + 1);

	const { rs, electionId, date } = t;
	const longNames = await knownLongNames(db, date, t.electionTypeId);
	await db
		.insert(electionsVotetypes)
		.values({ rs, electionId, votetypeId: 0, votetypeDescription: '' })
		.onConflictDoNothing();

	const psRows: (typeof pollingStations.$inferInsert)[] = [];
	const metaRows: (typeof electionResultPs.$inferInsert)[] = [];
	const resultRows: (typeof electionResult.$inferInsert)[] = [];
	const parties = new Map<number, typeof electionParty.$inferInsert>();
	// Per-station Wahlkreis for Gemeinden spanning several — what the Wahlkreis aggregates use instead
	// of the whole-Gemeinde assignment (see updateAggregateDistrict).
	const districtRows: (typeof electionVoteDistrictMapping.$inferInsert)[] = [];
	stations.forEach((s, i) => {
		const psId = psIds[i];
		const districtId = wahlkreisOf.get(s['gebiet-nr']);
		if (districtId !== undefined)
			districtRows.push({ rs, electionType: t.electionTypeId, date, psId, districtId });
		const lokal = lokale.get(s['gebiet-nr']);
		const eligible = int(s.A);
		const valid = int(s.D);
		psRows.push({
			rs,
			electionId,
			psId,
			date,
			name: s['gebiet-name'] || s['gebiet-nr'],
			address: lokal?.['Wahlraum-Adresse'] || null,
			description:
				lokal?.['Wahlraum-Barrierefrei'] === 'ja'
					? 'BARRIEREFREI'
					: lokal?.['Wahlraum-Barrierefrei'] === 'nein'
						? 'NICHT_BARRIEREFREI'
						: null,
			isPostal: lokal ? lokal['Bezirk-Art'] === 'B' : eligible === 0 && int(s.B) > 0
		});
		metaRows.push({
			rs,
			electionId,
			psId,
			votetypeId: 0,
			// Postal districts have no electoral roll of their own (like the JSON API's null).
			votesEligible: eligible > 0 ? String(eligible) : null,
			voters: s.B || null,
			invalidBallots: s.C || null,
			validBallots: s.D || null,
			votesCast: s.D || null,
			turnout: eligible > 0 ? String((int(s.B) / eligible) * 100) : null
		});
		for (const [col, row] of labelOf.get(s)!) {
			if (s[col] === '') continue;
			const partyId = Number(col.slice(1));
			if (!parties.has(partyId))
				parties.set(partyId, {
					rs,
					electionId,
					partyId,
					votetypeId: 0,
					psId: null,
					name: row.label,
					color: row.color,
					nameLong: longNames(row.label)
				});
			const votes = int(s[col]);
			resultRows.push({
				rs,
				electionId,
				psId,
				votetypeId: 0,
				partyId,
				voteCount: String(votes),
				votePercent: valid ? String((votes / valid) * 100) : null,
				candidateName: row.label
			});
		}
	});

	await db.transaction(async (tx) => {
		// Replaces whatever an earlier source left without numbers (e.g. the JSON API's empty 2016
		// stations) and marks the election as imported from here — so the JSON steps leave it alone.
		for (const table of [
			electionPartyFamily,
			electionResult,
			electionResultPs,
			electionParty,
			pollingStations
		])
			await tx.execute(sql`DELETE FROM ${table} WHERE rs = ${rs} AND election_id = ${electionId}`);
		await tx
			.update(elections)
			.set({ resultId: null })
			.where(and(eq(elections.rs, rs), eq(elections.electionId, electionId)));
		for (const [table, rows] of [
			[pollingStations, psRows],
			[electionParty, [...parties.values()]],
			[electionResultPs, metaRows],
			[electionResult, resultRows],
			[electionVoteDistrictMapping, districtRows]
		] as const)
			for (let i = 0; i < rows.length; i += 1000)
				await tx
					.insert(table)
					.values(rows.slice(i, i + 1000) as never)
					.onConflictDoNothing();
	});
	log(
		`${label}: ${stations.length} Wahlbezirke aus html5-Export${viaKreis ? ' des Kreises' : ''} übernommen`
	);
	return null;
}

/**
 * Ballot labels for stations whose result page names no candidates: the same ballot column is the
 * same candidate throughout a Wahlkreis, so take them from other Gemeinden of that Wahlkreis imported from
 * the html5 export (no `result_id`; their party ids are the CSV's column numbers — unlike the JSON
 * API's). In column order, with the votes this Gemeinde's stations add up to, for matchColumns.
 */
async function wahlkreisLabels(
	db: Db,
	districtId: number,
	t: { rs: number; date: string; electionTypeId: number },
	stations: CsvRow[]
): Promise<ResultRow[]> {
	const rows = await db.execute<{ party_id: number; name: string; color: string }>(sql`
		SELECT DISTINCT ON (p.party_id) p.party_id, p.name, p.color
		FROM ${electionVoteDistrictMapping} m
		JOIN ${elections} e ON e.rs = m.rs AND e.date = m.date
			AND e.election_type = m.election_type AND e.result_id IS NULL
		JOIN ${electionParty} p ON p.rs = e.rs AND p.election_id = e.election_id
		WHERE m.district_id = ${districtId} AND m.ps_id IS NULL AND m.rs <> ${t.rs}
			AND m.election_type = ${t.electionTypeId} AND m.date = ${t.date}
			AND p.name LIKE '%, %'
		ORDER BY p.party_id, p.rs`);
	const byParty = new Map(rows.map((r) => [Number(r.party_id), r]));
	const cols = dColumns(stations[0]).filter((c) => stations.some((s) => s[c] !== ''));
	if (cols.some((c) => !byParty.has(Number(c.slice(1))))) return [];
	return cols.map((c) => {
		const r = byParty.get(Number(c.slice(1)))!;
		return { label: r.name, color: r.color, votes: stations.reduce((n, s) => n + int(s[c]), 0) };
	});
}

/**
 * The html5 pages only give "Musterfrau, GRÜNE"; the JSON API also has "Erika Musterfrau, BÜNDNIS 90/DIE
 * GRÜNEN", which the party-family matching and the map's candidate names use. Taken from Gemeinden of
 * the same election crawled via JSON: the exact candidate where known, else "<surname>, <long party
 * name>" — or the label itself.
 */
async function knownLongNames(db: Db, date: string, electionTypeId: number) {
	const rows = await db
		.selectDistinct({ name: electionParty.name, nameLong: electionParty.nameLong })
		.from(electionParty)
		.innerJoin(
			elections,
			and(eq(elections.electionId, electionParty.electionId), eq(elections.rs, electionParty.rs))
		)
		.where(
			and(
				eq(elections.date, date),
				eq(elections.electionType, electionTypeId),
				sql`${electionParty.nameLong} IS NOT NULL`
			)
		);
	const byLabel = new Map<string, string>();
	const partyLong = new Map<string, string>();
	const partyOf = (s: string) => s.slice(s.indexOf(', ') + 2);
	for (const r of rows) {
		if (!r.name || !r.nameLong || !r.name.includes(', ') || !r.nameLong.includes(', ')) continue;
		byLabel.set(r.name, r.nameLong);
		partyLong.set(partyOf(r.name), partyOf(r.nameLong));
	}
	return (label: string) => {
		if (byLabel.has(label)) return byLabel.get(label)!;
		const i = label.indexOf(', ');
		const long = i > 0 ? partyLong.get(label.slice(i + 2)) : undefined;
		return long ? `${label.slice(0, i)}, ${long}` : label;
	};
}

/**
 * Gemeinden crawled via the JSON API that span several Wahlkreise (Mannheim) have only whole-Gemeinde
 * Wahlkreis rows, so updateAggregateDistrict would put all their votes into one. Their html5 export
 * still lists each Wahlkreis's stations ("Bezirke (Wahlkreis: NN)"), by the same number the JSON API
 * names them with ("011.11") — written as per-station rows, but only where every station matches
 * (a station left without one would fall into updateAggregateDistrict's Stuttgart guess).
 */
export async function mapJsonStationsToWahlkreise(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	electionTypeId: number,
	log: Logger
) {
	const mapping = await db
		.select({ rs: electionVoteDistrictMapping.rs, psId: electionVoteDistrictMapping.psId })
		.from(electionVoteDistrictMapping)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, electionTypeId),
				eq(electionVoteDistrictMapping.date, date)
			)
		);
	const districtCount = new Map<number, number>();
	const hasPsRows = new Set(mapping.filter((m) => m.psId !== null).map((m) => m.rs));
	// Distinct (rs, Wahlkreis) pairs of the whole-Gemeinde rows — more than one: spans several.
	const pairs = await db
		.selectDistinct({
			rs: electionVoteDistrictMapping.rs,
			d: electionVoteDistrictMapping.districtId
		})
		.from(electionVoteDistrictMapping)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, electionTypeId),
				eq(electionVoteDistrictMapping.date, date),
				isNull(electionVoteDistrictMapping.psId)
			)
		);
	for (const { rs } of pairs)
		if (rs !== null) districtCount.set(rs, (districtCount.get(rs) ?? 0) + 1);

	const jsonElections = await db
		.select({ rs: elections.rs, electionId: elections.electionId, name: elections.electionName })
		.from(elections)
		.where(
			and(
				eq(elections.date, date),
				eq(elections.electionType, electionTypeId),
				sql`${elections.resultId} IS NOT NULL`
			)
		);
	for (const e of jsonElections) {
		if (hasPsRows.has(e.rs) || (districtCount.get(e.rs) ?? 0) < 2) continue;
		const city = cityList.find((c) => c.rs === e.rs);
		if (!city) continue;
		const label = city.name ?? String(city.rs);
		const base = `${BASE}/wahltermin-${formatDateForUrl(date)}/${padAgs(city.ags)}/html5`;
		const info = await fetchText(`${base}/OpenDataInfo.html`);
		const wkFiles = (info ? parseOpenDataFiles(info) : []).flatMap((f) => {
			const nr = /^Bezirke \(Wahlkreis: (\d+)\)$/.exec(f.ebene)?.[1];
			return nr && e.name?.startsWith(f.wahl) ? [{ nr: Number(nr), url: f.url }] : [];
		});
		const wahlkreisOf = new Map<string, number>();
		for (const f of wkFiles) {
			const csv = await fetchText(`${base}/${f.url}`);
			for (const r of csv ? parseOpenDataCsv(csv) : []) {
				wahlkreisOf.set(r['gebiet-nr'], f.nr);
				if (r['gebiet-name']) wahlkreisOf.set(r['gebiet-name'], f.nr);
			}
		}
		const stations = await db
			.select({ psId: pollingStations.psId, name: pollingStations.name })
			.from(pollingStations)
			.where(and(eq(pollingStations.rs, e.rs), eq(pollingStations.electionId, e.electionId)));
		const rows = stations.flatMap((s) => {
			const districtId = s.name === null ? undefined : wahlkreisOf.get(s.name);
			return districtId === undefined
				? []
				: [{ rs: e.rs, electionType: electionTypeId, date, psId: s.psId, districtId }];
		});
		if (stations.length === 0 || rows.length < stations.length) {
			log(
				`${label}: nur ${rows.length} von ${stations.length} Wahlbezirken einem Wahlkreis zuordenbar, keine Zuordnung je Bezirk`,
				undefined,
				'warn'
			);
			continue;
		}
		await db.insert(electionVoteDistrictMapping).values(rows).onConflictDoNothing();
		log(`${label}: ${rows.length} Wahlbezirke ihren Wahlkreisen zugeordnet (html5-Export)`);
	}
}
