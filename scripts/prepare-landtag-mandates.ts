/**
 * One-off per Landtagswahl: who represents each Landtags-Wahlkreis, written to the same per-date
 * mandate file the Bundestag uses (`src/lib/server/map/mandates/<date>.json`, see mandates.ts).
 *
 * Until 2021 (single vote, no party lists), from the "Abgeordnete nach Wahlkreisen" table of the
 * Landeszentrale für politische Bildung (https://www.landtagswahl-bw.de/abgeordnete-<year>):
 * - `direct`: the Erstmandat (§ 2 Abs. 3 Satz 1 LWG) — the Wahlkreis winner.
 * - `list`: Zweitmandate — a party's remaining seats went to its best Wahlkreis candidates per
 *   Regierungsbezirk, so they belong to a Wahlkreis too.
 *
 * From 2026 (Erst- and Zweitstimme, Landeslisten), like the Bundestag, from the Statistisches
 * Landesamt (see SOURCES in statistikBw.ts):
 * - `direct`: the Wahlkreis winner (every one gets the seat — BW compensates overhang seats);
 * - `list`: members elected via their party's Landesliste who also ran in this Wahlkreis (matched by
 *   name and party on its result page). List-only candidates belong to no Wahlkreis and are left out.
 *
 * Run with: bun run scripts/prepare-landtag-mandates.ts 2021-03-14
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEntities } from '../src/lib/server/scraper/html5OpenData';
import { parseOpenDataCsv } from '../src/lib/server/scraper/kreisOpenData';
import { SOURCES, displayName, parseWahlkreisPage } from '../src/lib/server/scraper/statistikBw';

const date = process.argv[2];
if (!date) throw new Error('usage: prepare-landtag-mandates.ts <date, e.g. 2021-03-14>');

type Person = { name: string; party: string; percent: number | null };
type ListMember = { name: string; party: string; listPlace: number | null };
type Out = Record<string, { direct: (Person & { seat: boolean }) | null; list: ListMember[] }>;

async function get(url: string): Promise<Response> {
	const res = await fetch(url, { headers: { 'user-agent': 'wahlergebnisse-bw' } });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res;
}

async function fromLpb(): Promise<Out> {
	const res = await get(`https://www.landtagswahl-bw.de/abgeordnete-${date.slice(0, 4)}`);
	const out: Out = {};
	let wk: string | null = null;
	for (const m of (await res.text()).matchAll(
		/<tr><td>([^<]*)<\/td><td>([EZ])<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>[^<]*<\/td><td>([^<]*)<\/td><\/tr>/g
	)) {
		// The Wahlkreis cell ("01 Stuttgart I") is only filled on its first row.
		const nr = /^(\d+) /.exec(decodeEntities(m[1]))?.[1];
		if (nr) wk = String(Number(nr));
		if (!wk) throw new Error(`row before any Wahlkreis: ${m[0]}`);
		out[wk] ??= { direct: null, list: [] };
		const p: Person = {
			name: displayName(decodeEntities(m[3])),
			party: decodeEntities(m[4]),
			percent: m[5] ? Number(decodeEntities(m[5]).replace(',', '.')) : null
		};
		if (m[2] === 'E') out[wk].direct = { ...p, seat: true };
		else out[wk].list.push({ name: p.name, party: p.party, listPlace: null });
	}
	return out;
}

async function fromStatistikBw(source: (typeof SOURCES)[string]): Promise<Out> {
	const results = parseOpenDataCsv(await (await get(source.csv)).text());
	const elected = parseOpenDataCsv(
		new TextDecoder('windows-1252').decode(await (await get(source.elected)).arrayBuffer())
	);
	const person = (r: Record<string, string>) =>
		[r.Titel, r.Vorname, r.Familienname].filter(Boolean).join(' ');
	// The elected-members CSV is Windows-1252, so "Dvořák-Vučetić" arrives as "Dvorák-Vucetic" — match
	// without diacritics, and name people as the (UTF-8) result pages spell them.
	const fold = (name: string, party: string) =>
		`${name.normalize('NFD').replace(/\p{M}/gu, '')}|${party}`;

	const out: Out = {};
	/** fold("Dr. Erika Mustermann", "Die PARTEI") → the Wahlkreis she ran in and her name there. */
	const candidacy = new Map<string, { wk: string; name: string }>();
	for (const wkRow of results.filter((r) => r.Gebietsart === 'WAHLKREIS')) {
		const wk = wkRow.Wahlkreisnummer;
		const page = parseWahlkreisPage(await (await get(source.wahlkreisPage(wk))).text());
		for (const r of page)
			if (r.candidate)
				candidacy.set(fold(displayName(r.candidate), r.short), {
					wk,
					name: displayName(r.candidate)
				});
		const winner = elected.find((e) => e.Gebietsart === 'WAHLKREIS' && e.Gebietsnummer === wk);
		if (!winner) throw new Error(`Wahlkreis ${wk}: keine gewählte Person`);
		const party = winner['Wahlvorschlag-Kurzname'];
		const row = page.find(
			(r) => r.candidate && fold(displayName(r.candidate), r.short) === fold(person(winner), party)
		);
		if (!row) throw new Error(`Wahlkreis ${wk}: ${person(winner)} nicht auf der Ergebnisseite`);
		const valid = Number(wkRow['Erststimmen gueltige (D)']);
		out[wk] = {
			direct: {
				name: displayName(row.candidate),
				party,
				percent: row.erst && valid ? Math.round((row.erst / valid) * 1000) / 10 : null,
				seat: true
			},
			list: []
		};
	}
	for (const e of elected.filter((e) => e.Gebietsart === 'LAND')) {
		const party = e['Wahlvorschlag-Kurzname'];
		const ran = candidacy.get(fold(person(e), party));
		if (!ran) {
			console.log(
				`${person(e)} (${party}): nur über die Liste angetreten, keinem Wahlkreis zugeordnet`
			);
			continue;
		}
		out[ran.wk].list.push({ name: ran.name, party, listPlace: Number(e.Listenposition) || null });
	}
	for (const w of Object.values(out))
		w.list.sort((a, b) => (a.listPlace ?? 99) - (b.listPlace ?? 99));
	return out;
}

const source = SOURCES[date];
const out = source ? await fromStatistikBw(source) : await fromLpb();
const seats = Object.values(out).reduce((n, w) => n + (w.direct ? 1 : 0) + w.list.length, 0);
if (Object.keys(out).length !== 70 || Object.values(out).some((w) => !w.direct))
	throw new Error(`expected 70 Wahlkreise with an Erstmandat, got ${Object.keys(out).length}`);

const file = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	`../src/lib/server/map/mandates/${date}.json`
);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, '\t') + '\n');
console.log(`wrote ${file}: 70 Wahlkreise, ${seats} Abgeordnete`);
