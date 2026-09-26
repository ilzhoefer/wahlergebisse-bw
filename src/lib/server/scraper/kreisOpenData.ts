import { and, eq, inArray, like, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	electionsVotetypes,
	electionParty,
	electionResult,
	electionResultPs,
	pollingStations
} from '$lib/server/db/schema';
import { BASE, formatDateForUrl, padAgs, parseJson, type Logger } from './client';
import { getElectionIds } from './elections';

type Db = typeof DbType;

/** `polling_stations.description` of an imported Gemeinde whose postal votes its Kreis (or an
 * administrative association) counts centrally — so they're missing from its figures. Read by the map
 * to show a note (see getRegionBreakdowns' `postalElsewhere`). */
export const POSTAL_ELSEWHERE_MARKER = 'Briefwahl zentral ausgezählt';
/** Below this share of voters with a Wahlschein, a Gemeinde's postal votes are evidently counted
 * elsewhere (Gemeinden that count their own typically have 30–50 %). */
const POSTAL_SHARE_THRESHOLD = 0.05;
/** The single synthetic "polling station" an imported Gemeinde gets (real ones are komm.one ids). */
const OPEN_DATA_PS_ID = 0;

interface OpenDataIndex {
	csvs: { wahl: string; ebene: string; url: string }[];
}

/** Gemeinde names as the CSVs ("Gemeinde Altheim (Alb)", "Stadt Schönau im Schwarzwald") and the
 * cities table ("Esslingen am Neckar, Stadt", "Altheim (Landkreis Alb-Donau-Kreis)") write them. */
export function normalizeGemeindeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/^(gemeinde|stadt|große kreisstadt|markt)\s+/, '')
		.replace(/,\s*(stadt|gemeinde)$/, '')
		.replace(/\s*\(landkreis[^)]*\)$/, '')
		.trim();
}

/** Semicolon CSV → header-keyed records. Names containing ";" are quoted ("Briefwahl Wbz. 45;
 * Wahlbezirke 01 bis 04"); no field spans lines. */
export function parseOpenDataCsv(text: string): Record<string, string>[] {
	const [head, ...lines] = text
		.trim()
		.split('\n')
		.map((l) =>
			[...l.replace(/\r$/, '').matchAll(/(?:^|;)("(?:[^"]|"")*"|[^;]*)/g)].map((m) =>
				m[1].startsWith('"') ? m[1].slice(1, -1).replaceAll('""', '"') : m[1]
			)
		);
	return lines.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])));
}

const num = (s: string | undefined) => (s ? Number(s) : null);

/**
 * Some small Gemeinden don't publish an election on komm.one themselves; their Landkreis does, with an
 * open-data CSV of per-Gemeinde results (e.g. Bundestagswahl 2025: ~140 Gemeinden). For every city
 * still without an `elections` row on `date`, this imports its row from its Kreis's Gemeinde CSV as
 * one synthetic polling station — enough for every aggregate and map grain above polling stations.
 *
 * Only the two-vote format (A/B/B1, C/D Erststimmen, E/F Zweitstimmen, D<n>/F<n> per ballot number)
 * is understood; other CSVs are skipped with a log line. Ballot number n is the statewide Landesliste
 * number, so party names come from the Zweitstimme lists already crawled for this election; numbers
 * without a Landesliste are independent Erststimme candidates. Idempotent (insert-or-ignore).
 */
export async function importKreisOpenData(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	log: Logger
) {
	const covered = new Set(
		(
			await db.selectDistinct({ rs: elections.rs }).from(elections).where(eq(elections.date, date))
		).map((r) => r.rs)
	);
	const missing = cityList.filter((c) => !covered.has(c.rs) && c.name);
	if (missing.length === 0)
		return log('Alle Gemeinden haben eigene Daten, kein Kreis-Import nötig');

	const byKreis = new Map<string, typeof missing>();
	for (const c of missing) {
		const kreisAgs = padAgs(c.ags).slice(0, 5) + '000';
		byKreis.set(kreisAgs, [...(byKreis.get(kreisAgs) ?? []), c]);
	}

	const dateStr = formatDateForUrl(date);
	let imported = 0;
	for (const [kreisAgs, cities] of byKreis) {
		const base = `${BASE}/wahltermin-${dateStr}/${kreisAgs}`;
		const index = await fetchJson<OpenDataIndex>(`${base}/daten/opendata/open_data.json`);
		const csvs = index?.csvs.filter((c) => c.ebene === 'Gemeinde') ?? [];
		if (csvs.length === 0) {
			log(
				`Kreis ${kreisAgs}: keine Open-Data-Datei je Gemeinde, ${cities.length} Gemeinden fehlen`
			);
			continue;
		}
		const kreisElections = (await getElectionIds(Number(kreisAgs), date)) ?? [];

		for (const csv of csvs) {
			// Some Kreise publish the CSV but list no elections in their own termin.json — then use the
			// id the Kreis's self-publishing Gemeinden have for it (election ids are scoped per rs).
			const election =
				kreisElections.find((e) => e.title.startsWith(csv.wahl)) ??
				(await electionOfKreisGemeinden(db, kreisAgs, date, csv.wahl));
			if (!election) {
				log(`Kreis ${kreisAgs}: Wahl "${csv.wahl}" nicht im Kreis-Termin gefunden, überspringe`);
				continue;
			}
			const res = await fetch(`${base}/daten/opendata/${csv.url}`).catch(() => null);
			const rows = res?.ok ? parseOpenDataCsv(await res.text()) : [];
			if (!rows[0] || !('F' in rows[0]) || !('B1' in rows[0])) {
				log(`Kreis ${kreisAgs}: "${csv.wahl}" hat kein unterstütztes Format, überspringe`);
				continue;
			}
			const parties = await landeslisten(db, date, csv.wahl);

			for (const row of rows) {
				const name = normalizeGemeindeName(row['gebiet-name'] ?? '');
				const matches = cities.filter((c) => normalizeGemeindeName(c.name!) === name);
				if (matches.length !== 1) continue; // not a missing Gemeinde (or ambiguous)
				const city = matches[0];
				await insertGemeinde(db, { city, date, election, csv, row, parties });
				imported++;
				log(`${city.name}: aus Open-Data des Kreises ${kreisAgs} übernommen`);
			}
		}
	}
	log(`Kreis-Open-Data: ${imported} von ${missing.length} fehlenden Gemeinden übernommen`);
}

async function fetchJson<T>(url: string): Promise<T | null> {
	try {
		const res = await fetch(url);
		return res.ok ? await parseJson<T>(res) : null;
	} catch {
		return null;
	}
}

async function electionOfKreisGemeinden(
	db: Db,
	kreisAgs: string,
	date: string,
	wahl: string
): Promise<{ electionId: number } | undefined> {
	const [row] = await db
		.select({ electionId: elections.electionId })
		.from(elections)
		.where(
			and(
				eq(elections.date, date),
				like(elections.electionName, `${wahl}%`),
				// rs = 2-digit Land + Kreis digits of the AGS, so the Kreis prefix is AGS digits 2–5.
				like(sql`${elections.rs}::text`, `${kreisAgs.slice(1, 5)}%`)
			)
		)
		.limit(1);
	return row;
}

type Party = { name: string | null; nameLong: string | null; color: string | null };

/** Ballot number → party, from this election's Zweitstimme lists already crawled elsewhere (they're
 * statewide, so any Gemeinde's list serves). */
async function landeslisten(db: Db, date: string, wahl: string): Promise<Map<number, Party>> {
	const rows = await db
		.selectDistinct({
			partyId: electionParty.partyId,
			name: electionParty.name,
			nameLong: electionParty.nameLong,
			color: electionParty.color
		})
		.from(electionParty)
		.innerJoin(
			elections,
			and(eq(elections.electionId, electionParty.electionId), eq(elections.rs, electionParty.rs))
		)
		.where(
			and(
				eq(elections.date, date),
				like(elections.electionName, `${wahl}%`),
				eq(electionParty.votetypeId, 1)
			)
		);
	return new Map(rows.map((r) => [r.partyId, r]));
}

async function insertGemeinde(
	db: Db,
	p: {
		city: { rs: number; name: string | null };
		date: string;
		election: { electionId: number };
		csv: { wahl: string };
		row: Record<string, string>;
		parties: Map<number, Party>;
	}
) {
	const { city, date, row, parties } = p;
	const electionId = p.election.electionId;
	const rs = city.rs;
	const eligible = num(row.A);
	const voters = num(row.B);
	const postalShare = voters ? (num(row.B1) ?? 0) / voters : 0;

	await db
		.insert(elections)
		.values({ electionId, rs, date, electionName: `${p.csv.wahl} - ${row['gebiet-name']}` })
		.onConflictDoNothing();
	await db
		.insert(pollingStations)
		.values({
			rs,
			psId: OPEN_DATA_PS_ID,
			electionId,
			date,
			name: `${row['gebiet-name']} (Open-Data des Kreises)`,
			description: postalShare < POSTAL_SHARE_THRESHOLD ? POSTAL_ELSEWHERE_MARKER : null,
			isPostal: false
		})
		.onConflictDoNothing();

	// votetype 0 = Erststimmen (C invalid, D valid, D<n>), 1 = Zweitstimmen (E, F, F<n>).
	for (const [votetypeId, invalidCol, validCol, description] of [
		[0, 'C', 'D', 'Erststimmen'],
		[1, 'E', 'F', 'Zweitstimmen']
	] as const) {
		await db
			.insert(electionsVotetypes)
			.values({ rs, electionId, votetypeId, votetypeDescription: description })
			.onConflictDoNothing();
		const valid = num(row[validCol]);
		await db
			.insert(electionResultPs)
			.values({
				rs,
				electionId,
				psId: OPEN_DATA_PS_ID,
				votetypeId,
				votesEligible: eligible === null ? null : String(eligible),
				voters: voters === null ? null : String(voters),
				invalidBallots: row[invalidCol] || null,
				validBallots: valid === null ? null : String(valid),
				votesCast: valid === null ? null : String(valid),
				turnout: eligible && voters !== null ? String((voters / eligible) * 100) : null
			})
			.onConflictDoNothing();

		for (const [col, value] of Object.entries(row)) {
			const m = new RegExp(`^${validCol}(\\d+)$`).exec(col);
			if (!m || value === '') continue;
			const partyId = Number(m[1]);
			const party = parties.get(partyId) ?? {
				name: `Einzelbewerber/in (Nr. ${partyId})`,
				nameLong: `Einzelbewerber/in (Nr. ${partyId})`,
				color: null
			};
			const votes = Number(value);
			await db
				.insert(electionParty)
				.values({ rs, electionId, partyId, votetypeId, psId: null, ...party })
				.onConflictDoNothing();
			await db
				.insert(electionResult)
				.values({
					rs,
					electionId,
					psId: OPEN_DATA_PS_ID,
					votetypeId,
					partyId,
					voteCount: String(votes),
					votePercent: valid ? String((votes / valid) * 100) : null, // percent, like komm.one's
					candidateName: party.name ?? ''
				})
				.onConflictDoNothing();
		}
	}
}

/** rs of imported Gemeinden whose postal votes are counted elsewhere (see POSTAL_ELSEWHERE_MARKER). */
export async function postalElsewhereRs(
	db: Db,
	rsList: number[],
	electionType: number,
	date: string
): Promise<Set<number>> {
	if (rsList.length === 0) return new Set();
	const rows = await db
		.selectDistinct({ rs: pollingStations.rs })
		.from(pollingStations)
		.innerJoin(
			elections,
			and(
				eq(elections.electionId, pollingStations.electionId),
				eq(elections.rs, pollingStations.rs)
			)
		)
		.where(
			and(
				eq(pollingStations.date, date),
				eq(elections.electionType, electionType),
				eq(pollingStations.description, POSTAL_ELSEWHERE_MARKER),
				inArray(pollingStations.rs, rsList)
			)
		);
	return new Set(rows.map((r) => r.rs));
}
