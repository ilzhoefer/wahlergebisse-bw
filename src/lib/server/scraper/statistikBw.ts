import { and, eq, inArray, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	cities,
	elections,
	electionsVotetypes,
	electionParty,
	electionPartyFamily,
	electionResult,
	electionResultPs,
	electionVoteDistrictMapping,
	pollingStations
} from '$lib/server/db/schema';
import type { Logger } from './client';
import { decodeEntities } from './html5OpenData';
import { parseOpenDataCsv } from './kreisOpenData';

type Db = typeof DbType;
type CsvRow = Record<string, string>;

/**
 * Landtagswahlen komm.one no longer serves through the votemanager API (from 2026 on it's a separate
 * static presentation per Kreiswahlleitung, with no index — see the 2026 API investigation). The
 * Statistisches Landesamt publishes the same numbers in one statewide CSV, down to every Urnen- and
 * Briefwahlbezirk, plus a result page per Wahlkreis naming the candidates.
 */
export const SOURCES: Record<
	string,
	{ csv: string; elected: string; wahlkreisPage: (nr: string) => string }
> = {
	'2026-03-08': {
		csv: 'https://wahlen.statistik-bw.de/ltw26/ltw26-ergebnisse.csv',
		/** Elected members (Windows-1252), for scripts/prepare-landtag-mandates.ts. */
		elected: 'https://wahlen.statistik-bw.de/ltw26/ltw26-gewaehlte.csv',
		wahlkreisPage: (nr) =>
			`https://wahlen.statistik-bw.de/ltw26/ergebnispraesentation_wahlkreis_${nr}.html`
	}
};

const LANDTAGSWAHL = 3;

/** Whether this Landtagswahl is imported from the Statistisches Landesamt instead of komm.one. */
export function hasStatistikBwSource(date: string, electionTypeId: number): boolean {
	return electionTypeId === LANDTAGSWAHL && date in SOURCES;
}

/** [date, election type] of every Wahl imported from here — for the admin page's date list. */
export const statistikBwDates = () => Object.keys(SOURCES).map((d) => [d, LANDTAGSWAHL] as const);

/** No komm.one id exists — one fixed id per date (election ids are only unique per rs). */
export const statistikElectionId = (date: string) => Number(date.replaceAll('-', ''));

/** D22 is "another Kreiswahlvorschlag" — a different party or independent in every Wahlkreis, so
 * it gets its own party id per Wahlkreis (each classified into its own family). */
const OTHER_COLUMN = 22;
const otherPartyId = (wk: number) => OTHER_COLUMN * 100 + wk;

/**
 * A Wahlbezirk's key on the map and in `polling_stations.name` (its first word): the Gebietsnummer,
 * minus Stuttgart's " (08111000-001-01)" suffix, spaces replaced so it stays one word. Shared with
 * scripts/prepare-wahlbezirke.ts, which keys the Wahlbezirk polygons the same way.
 */
export function stationKey(gebietsnummer: string): string {
	return gebietsnummer.replace(/ \(.*\)$/, '').replaceAll(' ', '_');
}

export interface PageRow {
	short: string;
	long: string;
	color: string;
	/** "Mustermann, Max" — empty for a list without a candidate here. */
	candidate: string;
	erst: number | null;
	zweit: number | null;
}

/** The first table of a Wahlkreis result page: one row per party, in ballot order. */
export function parseWahlkreisPage(html: string): PageRow[] {
	const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
	const rows: PageRow[] = [];
	for (const tr of table.split(/<tr[\s>]/).slice(1)) {
		const color = /partei__farbe"\s+style="color:\s*(#[0-9a-fA-F]{3,6})/.exec(tr);
		const name = /partei__name">([\s\S]*?)<\/span>/.exec(tr);
		if (!color || !name) continue;
		const abbr = /<abbr title="([^"]*)">([^<]*)<\/abbr>/.exec(name[1]);
		const short = decodeEntities(abbr ? abbr[2] : name[1].replace(/<[^>]*>/g, ''));
		// [party cell, candidate, Erststimmen, %, ±, Zweitstimmen, %, ±]
		const sorts = [...tr.matchAll(/data-sort="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
		const votes = (s: string | undefined) => (s ? Number(s) : null);
		rows.push({
			short,
			long: abbr ? decodeEntities(abbr[1]) : short,
			color: color[1].toLowerCase(),
			candidate: sorts[1] ?? '',
			erst: votes(sorts[2]),
			zweit: votes(sorts[5])
		});
	}
	return rows;
}

interface Label {
	name: string;
	nameLong: string;
	color: string;
}

/** "Dr. Mustermann, Erika" → "Dr. Erika Mustermann" (the JSON API's long-name style). */
export function displayName(candidate: string): string {
	const [last, first] = candidate.split(', ');
	const title = /^((?:(?:Prof|Dr)\.\s*)+)(.*)$/.exec(last);
	return title ? `${title[1]}${first} ${title[2]}` : `${first} ${last}`;
}

/**
 * Ballot labels for one Wahlkreis, keyed by party id: Zweitstimme lists as "CDU", Erststimme
 * candidates as "Mustermann, CDU" / "Max Mustermann, Christlich Demokratische Union Deutschlands" — the same
 * shape the JSON API gives Bundestag candidates. Page rows are matched to the CSV's columns by their
 * votes in the Wahlkreis (and, for D1–D21, the party of that Landesliste number).
 */
function wahlkreisLabels(
	wkRow: CsvRow,
	page: PageRow[]
): { erst: Map<number, Label>; zweit: Map<number, Label> } | string {
	// Each page row serves one column per vote — two small parties can tie; columns and rows are both
	// in ballot order, so taking the first unused match keeps them apart.
	const pick = (used: Set<PageRow>, match: (r: PageRow) => boolean) => {
		const row = page.find((r) => !used.has(r) && match(r));
		if (row) used.add(row);
		return row;
	};
	const usedZweit = new Set<PageRow>();
	const usedErst = new Set<PageRow>();
	const zweit = new Map<number, Label>();
	for (const [col, value] of Object.entries(wkRow)) {
		const m = /^F(\d+)$/.exec(col);
		if (!m || value === '') continue;
		const row = pick(usedZweit, (r) => r.zweit === Number(value));
		if (!row) return `Zweitstimmen-Spalte ${col} (${value}) nicht auf der Wahlkreisseite`;
		zweit.set(Number(m[1]), { name: row.short, nameLong: row.long, color: row.color });
	}
	const erst = new Map<number, Label>();
	const wk = Number(wkRow.Wahlkreisnummer);
	for (const [col, value] of Object.entries(wkRow)) {
		const m = /^D(\d+)$/.exec(col);
		if (!m || value === '') continue;
		const n = Number(m[1]);
		const party = zweit.get(n)?.name;
		const row = pick(
			usedErst,
			(r) => !!r.candidate && r.erst === Number(value) && (n === OTHER_COLUMN || r.short === party)
		);
		if (!row) return `Erststimmen-Spalte ${col} (${value}) nicht auf der Wahlkreisseite`;
		erst.set(n === OTHER_COLUMN ? otherPartyId(wk) : n, {
			name: `${row.candidate.split(', ')[0]}, ${row.short}`,
			nameLong: `${displayName(row.candidate)}, ${row.long}`,
			color: row.color
		});
	}
	return { erst, zweit };
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.text();
}

const num = (s: string | undefined) => (s ? Number(s) : 0);

/**
 * Imports a Landtagswahl from the Statistisches Landesamt (see SOURCES): per Gemeinde an `elections`
 * row, every Urnen-/Briefwahlbezirk as a polling station with Erst- (votetype 0) and Zweitstimmen
 * (1), and its Wahlkreis — per station where a Gemeinde spans several. Replaces whatever an earlier
 * run left for this election; the aggregates are computed by the usual steps afterwards.
 *
 * The CSV's few gemeindeübergreifende Briefwahlbezirke (AGS "BW", counted by a Kreiswahlleitung for
 * several small Gemeinden) belong to no single Gemeinde and are left out — ponytail: ~2,000 of 5.4M
 * voters; distribute them over their Gemeinden if that ever matters.
 */
export async function importStatistikBw(db: Db, date: string, log: Logger) {
	const source = SOURCES[date];
	const rows = parseOpenDataCsv(await fetchText(source.csv));
	log(`Statistisches Landesamt: ${rows.length} Gebiete geladen`);

	const wkRows = rows.filter((r) => r.Gebietsart === 'WAHLKREIS');
	const labels = new Map<number, { erst: Map<number, Label>; zweit: Map<number, Label> }>();
	for (const [i, wkRow] of wkRows.entries()) {
		const nr = wkRow.Wahlkreisnummer;
		log('', { level: 'city', index: i + 1, total: wkRows.length, label: `Wahlkreis ${nr}` });
		const parsed = wahlkreisLabels(
			wkRow,
			parseWahlkreisPage(await fetchText(source.wahlkreisPage(nr)))
		);
		if (typeof parsed === 'string') throw new Error(`Wahlkreis ${nr}: ${parsed}`);
		labels.set(Number(nr), parsed);
	}
	log(`${labels.size} Wahlkreisseiten ausgewertet`);

	const rsByAgs = new Map(
		(await db.select({ rs: cities.rs, ags: cities.ags }).from(cities)).map((c) => [
			String(c.ags).padStart(8, '0'),
			c.rs
		])
	);
	const gemeindeNames = new Map(
		rows.filter((r) => r.Gebietsart === 'GEMEINDE').map((r) => [r.AGS.slice(0, 8), r.Gemeindename])
	);
	const stationsByAgs = new Map<string, CsvRow[]>();
	let skipped = 0;
	for (const r of rows) {
		if (r.Gebietsart !== 'URNENWAHLBEZIRK' && r.Gebietsart !== 'BRIEFWAHLBEZIRK') continue;
		if (!rsByAgs.has(r.AGS)) {
			skipped++;
			log(`Wahlbezirk "${r.Gebietsname}" (AGS ${r.AGS}) keiner Gemeinde zuordenbar, übersprungen`);
			continue;
		}
		stationsByAgs.set(r.AGS, [...(stationsByAgs.get(r.AGS) ?? []), r]);
	}

	const electionId = statistikElectionId(date);
	const title = `Landtagswahl ${date.slice(0, 4)}`;
	const out = {
		elections: [] as (typeof elections.$inferInsert)[],
		votetypes: [] as (typeof electionsVotetypes.$inferInsert)[],
		stations: [] as (typeof pollingStations.$inferInsert)[],
		parties: [] as (typeof electionParty.$inferInsert)[],
		meta: [] as (typeof electionResultPs.$inferInsert)[],
		results: [] as (typeof electionResult.$inferInsert)[],
		districts: [] as (typeof electionVoteDistrictMapping.$inferInsert)[]
	};
	const cityNames = new Map(
		(await db.select({ rs: cities.rs, name: cities.name }).from(cities)).map((c) => [c.rs, c.name])
	);

	for (const [ags, stations] of stationsByAgs) {
		const rs = rsByAgs.get(ags)!;
		out.elections.push({
			electionId,
			rs,
			date,
			electionType: LANDTAGSWAHL,
			electionName: `${title} - ${gemeindeNames.get(ags) ?? cityNames.get(rs) ?? ags}`
		});
		for (const [votetypeId, description] of [
			[0, 'Erststimmen'],
			[1, 'Zweitstimmen']
		] as const)
			out.votetypes.push({ rs, electionId, votetypeId, votetypeDescription: description });

		const wks = [...new Set(stations.map((s) => Number(s.Wahlkreisnummer)))];
		for (const districtId of wks)
			out.districts.push({ rs, electionType: LANDTAGSWAHL, date, psId: null, districtId });

		const parties = new Map<string, typeof electionParty.$inferInsert>();
		stations.forEach((s, i) => {
			const psId = i + 1;
			const wk = Number(s.Wahlkreisnummer);
			if (wks.length > 1)
				out.districts.push({ rs, electionType: LANDTAGSWAHL, date, psId, districtId: wk });
			out.stations.push({
				rs,
				electionId,
				psId,
				date,
				name: `${stationKey(s.Gebietsnummer)} ${s.Gebietsname}`,
				isPostal: s.Gebietsart === 'BRIEFWAHLBEZIRK'
			});
			const eligible = num(s['Wahlberechtigte gesamt (A)']);
			const voters = num(s['Waehler gesamt (B)']);
			// votetype 0 = Erststimmen (C invalid, D valid, D<n>), 1 = Zweitstimmen (E, F, F<n>).
			for (const [votetypeId, invalidCol, validCol, prefix] of [
				[0, 'Erststimmen ungueltige (C)', 'Erststimmen gueltige (D)', 'D'],
				[1, 'Zweitstimmen ungueltige (E)', 'Zweitstimmen gueltige (F)', 'F']
			] as const) {
				const valid = num(s[validCol]);
				out.meta.push({
					rs,
					electionId,
					psId,
					votetypeId,
					// Briefwahlbezirke have no electoral roll of their own (like the JSON API's null).
					votesEligible: eligible > 0 ? String(eligible) : null,
					voters: String(voters),
					invalidBallots: String(num(s[invalidCol])),
					validBallots: String(valid),
					votesCast: String(valid),
					turnout: eligible > 0 ? String((voters / eligible) * 100) : null
				});
				const wkLabels = labels.get(wk)![votetypeId === 0 ? 'erst' : 'zweit'];
				for (const [col, value] of Object.entries(s)) {
					const m = new RegExp(`^${prefix}(\\d+)$`).exec(col);
					if (!m || value === '') continue;
					const n = Number(m[1]);
					const partyId = votetypeId === 0 && n === OTHER_COLUMN ? otherPartyId(wk) : n;
					const label = wkLabels.get(partyId);
					if (!label) throw new Error(`${ags} ${s.Gebietsnummer}: kein Label für ${col}`);
					// One label per party id and Gemeinde; the station's own candidate is in the result row
					// (a Gemeinde spanning several Wahlkreise has one D1 candidate per Wahlkreis).
					if (!parties.has(`${votetypeId}:${partyId}`))
						parties.set(`${votetypeId}:${partyId}`, {
							rs,
							electionId,
							partyId,
							votetypeId,
							psId: null,
							...label
						});
					const votes = Number(value);
					out.results.push({
						rs,
						electionId,
						psId,
						votetypeId,
						partyId,
						voteCount: String(votes),
						votePercent: valid ? String((votes / valid) * 100) : null,
						candidateName: label.name
					});
				}
			}
		});
		out.parties.push(...parties.values());
	}

	const rsList = [...stationsByAgs.keys()].map((ags) => rsByAgs.get(ags)!);
	await db.transaction(async (tx) => {
		const ours = and(inArray(elections.rs, rsList), eq(elections.electionId, electionId));
		for (const table of [
			electionPartyFamily,
			electionResult,
			electionResultPs,
			electionParty,
			pollingStations,
			electionsVotetypes
		])
			await tx.execute(
				sql`DELETE FROM ${table} WHERE election_id = ${electionId} AND rs IN (${sql.join(rsList, sql`, `)})`
			);
		await tx
			.delete(electionVoteDistrictMapping)
			.where(
				and(
					eq(electionVoteDistrictMapping.electionType, LANDTAGSWAHL),
					eq(electionVoteDistrictMapping.date, date)
				)
			);
		await tx.delete(elections).where(ours);
		for (const [table, batch] of [
			[elections, out.elections],
			[electionsVotetypes, out.votetypes],
			[pollingStations, out.stations],
			[electionParty, out.parties],
			[electionResultPs, out.meta],
			[electionResult, out.results],
			[electionVoteDistrictMapping, out.districts]
		] as const)
			for (let i = 0; i < batch.length; i += 1000)
				await tx.insert(table).values(batch.slice(i, i + 1000) as never);
	});
	log(
		`Landtagswahl ${date}: ${stationsByAgs.size} Gemeinden, ${out.stations.length} Wahlbezirke übernommen` +
			(skipped ? `, ${skipped} gemeindeübergreifende Briefwahlbezirke ausgelassen` : '')
	);
}
