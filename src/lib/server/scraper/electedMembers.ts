import { and, eq } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionParty, electionElectedCandidates } from '$lib/server/db/schema';
import {
	BASE,
	padAgs,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnNotFound,
	runWithConcurrency,
	DEFAULT_PARALLEL,
	type Logger
} from './client';

type Db = typeof DbType;

interface SitzeResponse {
	Komponente?: {
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
 *
 * `parallel` cities are processed concurrently (see `runWithConcurrency`); see `updateElectionDates`
 * for why progress ticks use a shared "started so far" counter rather than the cityList array position.
 */
export async function getElectedMembers(
	db: Db,
	cityList: { rs: number; ags: number; name: string | null }[],
	date: string,
	electionTypeId: number,
	log: Logger,
	parallel = DEFAULT_PARALLEL
) {
	let started = 0;
	let completed = 0;
	await runWithConcurrency(cityList, parallel, async (city) => {
		const cityLabel = city.name ?? String(city.rs);
		// See updateElectionDates for why `position` (log text only) and `completed` (the progress tick's
		// index) are kept separate — reusing `position` for both would make the bar jump backwards
		// whenever an earlier-started city finishes after later ones have already begun.
		const position = ++started;
		const citySkip = (message: string) =>
			log(message, {
				level: 'city',
				index: ++completed,
				total: cityList.length,
				label: cityLabel,
				rs: city.rs,
				cityStatus: 'skipped'
			});

		log(`[${position}/${cityList.length}] ${cityLabel}: gewählte Mitglieder abrufen`, {
			level: 'city',
			index: completed,
			total: cityList.length,
			label: cityLabel,
			rs: city.rs,
			cityStatus: 'in_progress'
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
			citySkip(`${cityLabel}: keine passende Wahl gefunden, überspringe`);
			return;
		}
		if (!relevantElection.resultId) {
			citySkip(`${cityLabel}: keine result_id vorhanden, überspringe`);
			return;
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
			citySkip(`${cityLabel}: Sitzverteilung nicht verfügbar, überspringe`);
			return;
		}

		const seats = content.Komponente?.sitze?.tabelle;
		if (!seats) {
			citySkip(`${cityLabel}: keine Sitzdaten vorhanden, überspringe`);
			return;
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

		log('', {
			level: 'city',
			index: ++completed,
			total: cityList.length,
			label: cityLabel,
			rs: city.rs,
			cityStatus: 'done'
		});
	});
}
