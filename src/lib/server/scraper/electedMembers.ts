import { and, eq } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionParty, electionElectedCandidates } from '$lib/server/db/schema';
import {
	BASE,
	padAgs,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnNotFound,
	type Logger
} from './client';

type Db = typeof DbType;

interface SitzeResponse {
	Komponente: {
		sitze?: {
			tabelle: {
				ueberschriften: string[];
				zeilen: string[][];
			};
		};
	};
}

/**
 * Port of `get_elected_members`. Uses `elections.result_id` (the Votemanager result ID) to build the
 * seats-table URL — this only works because `updateElectionDates` (unlike the R original) actually
 * persists `result_id`, see the Phase 3 plan findings.
 */
export async function getElectedMembers(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	electionTypeId: number,
	log: Logger
) {
	for (const [i, city] of cityList.entries()) {
		const cityLabel = city.name ?? String(city.rs);
		log(`[${i + 1}/${cityList.length}] ${cityLabel}: gewählte Mitglieder abrufen`, {
			level: 'city',
			index: i + 1,
			total: cityList.length,
			label: cityLabel
		});

		const [relevantElection] = await db
			.select()
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
		if (!relevantElection.resultId) {
			log(`${city.name ?? city.rs}: keine result_id vorhanden, überspringe`);
			continue;
		}

		const dateStr = formatDateForUrl(date);
		const agsStr = padAgs(city.ags);
		const { status, content } = await fetchWithFallback<SitzeResponse>(
			`${BASE}/wahltermin-${dateStr}/${agsStr}/daten/api/wahl_${relevantElection.electionId}/ergebnis_${relevantElection.resultId}_0.json`,
			`${BASE}/wahltermin-${dateStr}/${agsStr}/api/praesentation/wahl_${relevantElection.electionId}/ergebnis_${relevantElection.resultId}_0.json`,
			fallbackOnNotFound
		);

		// The R original hard stop()s on a persistent 404 here — too aggressive for a ~1100-city loop, so
		// this just logs and moves to the next city instead, like every other loop in this module.
		if (status === 404 || !content) {
			log(`${city.name ?? city.rs}: Sitzverteilung nicht verfügbar, überspringe`);
			continue;
		}

		const seats = content.Komponente.sitze?.tabelle;
		if (!seats) {
			log(`${city.name ?? city.rs}: keine Sitzdaten vorhanden, überspringe`);
			continue;
		}

		const relevantParties = await db
			.select({ name: electionParty.name, partyId: electionParty.partyId })
			.from(electionParty)
			.where(
				and(
					eq(electionParty.rs, city.rs),
					eq(electionParty.electionId, relevantElection.electionId)
				)
			);

		const headers = seats.ueberschriften;
		const wahlvorschlagIdx = headers.indexOf('Wahlvorschlag');
		const bewerberIdx = headers.indexOf('Bewerber');
		const mandatIdx = headers.indexOf('Mandat');

		for (const cells of seats.zeilen) {
			const wahlvorschlag = wahlvorschlagIdx === -1 ? undefined : cells[wahlvorschlagIdx];
			const candidateName = bewerberIdx === -1 ? undefined : cells[bewerberIdx];
			const mandatRaw = mandatIdx === -1 ? undefined : cells[mandatIdx];
			if (!candidateName) continue;

			// Matches only on name, like the R original's `left_join(by = "Wahlvorschlag" == "name")` — if
			// several election_party rows share a name (e.g. across votetypes/polling stations), the first
			// match wins rather than fanning out into duplicate candidate rows.
			const partyId = relevantParties.find((p) => p.name === wahlvorschlag)?.partyId ?? null;
			const mandateType = mandatRaw?.replaceAll('Gewählt', 'Direktmandat') ?? null;

			await db
				.insert(electionElectedCandidates)
				.values({
					rs: city.rs,
					electionType: electionTypeId,
					date,
					electionId: relevantElection.electionId,
					partyId,
					name: candidateName,
					mandateType
				})
				.onConflictDoNothing();
		}
	}
}
