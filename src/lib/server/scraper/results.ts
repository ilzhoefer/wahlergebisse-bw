import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import {
	elections,
	electionsVotetypes,
	pollingStations,
	electionResult,
	electionResultPs,
	electionParty
} from '$lib/server/db/schema';
import {
	BASE,
	padAgs,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnNotFound,
	type Logger
} from './client';

type Db = typeof DbType;

const STUTTGART_RS = 81110000000;

interface ErgebnisInfoRow {
	label: { labelKurz: string };
	zahl?: string;
	prozent?: string;
}

interface ErgebnisRow {
	label: { labelKurz: string };
	color?: string;
	zahl?: string;
	prozent?: string;
	sub_zeilen?: { label: { labelKurz: string }; zahl?: string; prozent?: string }[];
}

interface ErgebnisGrafikBalken {
	bezeichnung: string;
	bezeichnungAusfuehrlich?: string;
}

interface ErgebnisResponse {
	Komponente: {
		info: { tabelle: { zeilen: ErgebnisInfoRow[] } };
		tabelle: { zeilen: ErgebnisRow[] };
		grafik?: { balken?: ErgebnisGrafikBalken[]; sonstigeBalken?: ErgebnisGrafikBalken[] };
	};
}

interface ResultRow {
	partyId: number;
	voteCount: number | null;
	votePercent: number | null;
	candidateName: string;
}

interface PartyRow {
	partyId: number;
	name: string;
	color: string | null;
	nameLong: string | null;
}

interface ResultMetadata {
	votesEligible: number | null;
	voters: number | null;
	invalidBallots: number | null;
	validBallots: number | null;
	votesCast: number | null;
	turnout: number | null;
}

/**
 * Port of `parse_number(x, locale = locale(decimal_mark = ","))`: strips anything that isn't a digit,
 * comma, minus or dot, drops `.` (thousands separator) and treats `,` as the decimal point.
 */
function parseGermanNumber(value: string | undefined): number | null {
	if (value === undefined) return null;
	const cleaned = value
		.replace(/[^0-9,.-]/g, '')
		.replace(/\./g, '')
		.replace(',', '.');
	if (cleaned === '' || cleaned === '-') return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

function numToStr(n: number | null): string | null {
	return n === null ? null : n.toString();
}

/** Port of `get_index` — first row whose `label.labelKurz` matches one of `keywords`, or null. */
function getIndex(rows: ErgebnisInfoRow[], keywords: string[]): number | null {
	const idx = rows.findIndex((r) => keywords.includes(r.label.labelKurz));
	return idx === -1 ? null : idx;
}

/**
 * Port of `get_results_single_ps`. `isPostalGuess` is the polling station's currently-stored
 * `is_postal` flag — if a "real" `Wahlberechtigte` (eligible-voters) row turns up despite that guess,
 * this retroactively corrects `polling_stations.is_postal` to `false` (see Phase 3 plan findings).
 */
export async function getResultsSinglePs(
	db: Db,
	params: {
		psId: number;
		isPostalGuess: boolean;
		ags: number;
		electionId: number;
		date: string;
		votetypeId: number;
		rs: number;
		includeParty: boolean;
	}
): Promise<
	| { error: string }
	| { results: ResultRow[]; resultsParty: PartyRow[] | null; metadata: ResultMetadata }
> {
	const dateStr = formatDateForUrl(params.date);
	const agsStr = padAgs(params.ags);

	const { content } = await fetchWithFallback<ErgebnisResponse>(
		`${BASE}/wahltermin-${dateStr}/${agsStr}/daten/api/wahl_${params.electionId}/ergebnis_ebene_6_id_${params.psId}_${params.votetypeId}.json`,
		`${BASE}/wahltermin-${dateStr}/${agsStr}/api/praesentation/wahl_${params.electionId}/ergebnis_ebene_6_id_${params.psId}_${params.votetypeId}.json`,
		fallbackOnNotFound
	);

	const resultsRows = content?.Komponente?.tabelle?.zeilen;
	if (!resultsRows) {
		return { error: `Ergebnisse für Wahlbezirk ${params.psId} nicht verfügbar, überspringe` };
	}

	const infoRows = content.Komponente.info.tabelle.zeilen;
	const indexEligible = getIndex(infoRows, ['Wahlberechtigte']);
	const indexVoters = getIndex(infoRows, ['Wähler/-innen', 'Wähler/innen']);
	const indexInvalid = getIndex(infoRows, ['ungültige Stimmen', 'ungültige Stimmzettel']);
	const indexVotes = getIndex(infoRows, ['gültige Stimmen']);
	let indexValid = getIndex(infoRows, ['gültige Stimmzettel', 'gültige Stimmen']);

	// For some elections the valid-ballots row is "---" because it's identical to votes cast.
	if (indexValid !== null && infoRows[indexValid].zahl === '---') {
		indexValid = indexVotes;
	}

	const rowAt = (idx: number | null) => (idx === null ? undefined : infoRows[idx]);

	const metadata: ResultMetadata = {
		votesEligible: indexEligible === null ? null : parseGermanNumber(rowAt(indexEligible)?.zahl),
		voters: parseGermanNumber(rowAt(indexVoters)?.zahl),
		invalidBallots: parseGermanNumber(rowAt(indexInvalid)?.zahl),
		validBallots: parseGermanNumber(rowAt(indexValid)?.zahl),
		votesCast: parseGermanNumber(rowAt(indexVotes)?.zahl),
		turnout: parseGermanNumber(rowAt(indexVoters)?.prozent)
	};

	if (indexEligible !== null && params.isPostalGuess) {
		// The overview step guessed "postal" but this station actually reports eligible voters — correct it.
		await db
			.update(pollingStations)
			.set({ isPostal: false })
			.where(
				and(
					eq(pollingStations.psId, params.psId),
					eq(pollingStations.rs, params.rs),
					eq(pollingStations.electionId, params.electionId),
					eq(pollingStations.date, params.date)
				)
			);
	}

	let partyData: ErgebnisGrafikBalken[] = [];
	let resultsParty: PartyRow[] | null = null;
	if (params.includeParty) {
		const balken = content.Komponente.grafik?.balken ?? [];
		const sonstige = content.Komponente.grafik?.sonstigeBalken ?? [];
		partyData = [...balken, ...sonstige];
		resultsParty = [];
	}

	const results: ResultRow[] = [];
	resultsRows.forEach((row, i) => {
		// party_id is literally the 1-based loop index over this call's result rows, not a stable ID.
		const partyId = i + 1;

		if (resultsParty) {
			const match = partyData.find((p) => p.bezeichnung === row.label.labelKurz);
			resultsParty.push({
				partyId,
				name: row.label.labelKurz,
				color: row.color ?? null,
				nameLong: match?.bezeichnungAusfuehrlich ?? null
			});
		}

		if (!row.sub_zeilen) {
			// No candidate list under this row — for personalized elections the party's own label is the candidate.
			results.push({
				partyId,
				voteCount: parseGermanNumber(row.zahl),
				votePercent: parseGermanNumber(row.prozent),
				candidateName: row.label.labelKurz
			});
		} else {
			for (const person of row.sub_zeilen) {
				results.push({
					partyId,
					voteCount: parseGermanNumber(person.zahl),
					votePercent: parseGermanNumber(person.prozent),
					candidateName: person.label.labelKurz
				});
			}
		}
	});

	return { results, resultsParty, metadata };
}

/**
 * Port of `get_results_city`. Stuttgart's Bundestag election (`electionTypeId === 2`) is the only case
 * where party composition can differ per polling station (multiple Wahlkreise) — everywhere else,
 * party data is only fetched once per city, on its first polling station, and stored without a `psId`.
 */
export async function getResultsCity(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	electionTypeId: number,
	skipProcessed: boolean,
	log: Logger
) {
	for (const [i, city] of cityList.entries()) {
		log(`[${i + 1}/${cityList.length}] ${city.name ?? city.rs}: Ergebnisse abrufen`);

		const [relevantElection] = await db
			.select({ electionId: elections.electionId })
			.from(elections)
			.where(
				and(
					eq(elections.rs, city.rs),
					eq(elections.date, date),
					eq(elections.electionType, electionTypeId)
				)
			);

		if (!relevantElection) {
			log(`${city.name ?? city.rs}: keine passende Wahl gefunden, überspringe`);
			continue;
		}

		const relevantVotetypes = await db
			.select()
			.from(electionsVotetypes)
			.where(
				and(
					eq(electionsVotetypes.rs, city.rs),
					eq(electionsVotetypes.electionId, relevantElection.electionId)
				)
			);

		const relevantPs = await db
			.select()
			.from(pollingStations)
			.where(
				and(
					eq(pollingStations.rs, city.rs),
					eq(pollingStations.date, date),
					eq(pollingStations.electionId, relevantElection.electionId)
				)
			);

		if (skipProcessed) {
			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(electionResultPs)
				.where(
					and(
						eq(electionResultPs.rs, city.rs),
						eq(electionResultPs.electionId, relevantElection.electionId)
					)
				);
			if (count === relevantPs.length * relevantVotetypes.length) {
				log(`${city.name ?? city.rs}: bereits vollständig verarbeitet, überspringe`);
				continue;
			}
		}

		for (const [j, ps] of relevantPs.entries()) {
			// A single city (e.g. Stuttgart) can have hundreds of polling stations, each requiring its own
			// HTTP request — without this, the admin UI's progress log would show nothing but the initial
			// "Ergebnisse abrufen" line for however long that takes.
			if (j > 0 && j % 25 === 0) {
				log(`${city.name ?? city.rs}: Wahlbezirk ${j}/${relevantPs.length} verarbeitet`);
			}
			for (const votetype of relevantVotetypes) {
				if (skipProcessed) {
					const [existing] = await db
						.select({ id: electionResultPs.id })
						.from(electionResultPs)
						.where(
							and(
								eq(electionResultPs.rs, city.rs),
								eq(electionResultPs.electionId, relevantElection.electionId),
								eq(electionResultPs.psId, ps.psId),
								eq(electionResultPs.votetypeId, votetype.votetypeId)
							)
						);
					if (existing) continue;
				}

				let includeParty: boolean;
				let includePs: boolean;
				if (electionTypeId === 2 && city.rs === STUTTGART_RS) {
					includeParty = true;
					includePs = true;
				} else if (j === 0) {
					includeParty = true;
					includePs = false;
				} else {
					includeParty = false;
					includePs = false;
				}

				const result = await getResultsSinglePs(db, {
					psId: ps.psId,
					isPostalGuess: ps.isPostal ?? false,
					ags: city.ags,
					electionId: relevantElection.electionId,
					date,
					votetypeId: votetype.votetypeId,
					rs: city.rs,
					includeParty
				});

				if ('error' in result) {
					log(result.error);
					continue;
				}

				const { results, resultsParty, metadata } = result;

				for (const r of results) {
					await db
						.insert(electionResult)
						.values({
							rs: city.rs,
							electionId: relevantElection.electionId,
							psId: ps.psId,
							votetypeId: votetype.votetypeId,
							partyId: r.partyId,
							voteCount: numToStr(r.voteCount),
							votePercent: numToStr(r.votePercent),
							candidateName: r.candidateName
						})
						.onConflictDoNothing();
				}

				await db
					.insert(electionResultPs)
					.values({
						rs: city.rs,
						electionId: relevantElection.electionId,
						psId: ps.psId,
						votetypeId: votetype.votetypeId,
						votesEligible: numToStr(metadata.votesEligible),
						voters: numToStr(metadata.voters),
						invalidBallots: numToStr(metadata.invalidBallots),
						validBallots: numToStr(metadata.validBallots),
						votesCast: numToStr(metadata.votesCast),
						turnout: numToStr(metadata.turnout)
					})
					.onConflictDoNothing();

				if (includeParty && resultsParty) {
					for (const p of resultsParty) {
						await db
							.insert(electionParty)
							.values({
								rs: city.rs,
								electionId: relevantElection.electionId,
								partyId: p.partyId,
								votetypeId: votetype.votetypeId,
								psId: includePs ? ps.psId : null,
								name: p.name,
								color: p.color,
								nameLong: p.nameLong
							})
							.onConflictDoNothing();
					}
				}
			}
		}
	}
}
