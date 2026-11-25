import { and, eq, sql } from 'drizzle-orm';
import type { db as DbType } from '#lib/server/db/index.ts';
import { electionElectedCandidates } from '#lib/server/db/schema.ts';
import {
	BASE,
	formatDateForUrl,
	fetchWithFallback,
	fallbackOnNotFound,
	type Logger
} from './client';
import { nameKeySql } from './candidates';

type Db = typeof DbType;
const KREISTAG = 5;

interface TerminResponse {
	wahleintraege?: { wahl: { id: number }; gebiet_link?: { id: string } }[];
}
interface SitzeResponse {
	Komponente?: {
		sitze?: {
			tabelle: { ueberschriften: string[]; zeilen: string[][] };
			tortenDiagramm?: { entries?: { sitze: number }[] };
		};
	};
}

/**
 * Elected Kreistag members. Unlike a Gemeinderat's, they're only published at the Landkreis: the
 * Kreis's termin.json (under its AGS, e.g. 08116000) links the Kreistagswahl — same election id as
 * its Gemeinden's rows — to a Kreis-level result whose seat table lists every member with list,
 * Wahlkreis and mandate. Each member is recorded for every Gemeinde whose results contain them (list
 * and name within the Kreis) — i.e. every Gemeinde of their Wahlkreis — with that Gemeinde's
 * party_id, like the Gemeinderat rows.
 */
export async function getElectedKreistagMembers(db: Db, date: string, log: Logger) {
	await db
		.delete(electionElectedCandidates)
		.where(
			and(
				eq(electionElectedCandidates.electionType, KREISTAG),
				eq(electionElectedCandidates.date, date)
			)
		);

	// One Kreistagswahl per Landkreis: its election id and the Kreis's 4-digit rs prefix.
	const kreise = (await db.execute(sql`
		SELECT DISTINCT election_id, left(lpad(rs::text, 11, '0'), 4) AS kreis
		FROM elections WHERE election_type = ${KREISTAG} AND date = ${date}
		ORDER BY 2
	`)) as unknown as { election_id: number; kreis: string }[];

	const dateStr = formatDateForUrl(date);
	let total = 0;
	for (const { election_id: electionId, kreis } of kreise) {
		const ags = `${kreis}000`.padStart(8, '0');
		const base = `${BASE}/wahltermin-${dateStr}/${ags}`;
		const termin = await fetchWithFallback<TerminResponse>(
			`${base}/daten/api/termin.json`,
			`${base}/api/praesentation/termin.json`,
			fallbackOnNotFound
		);
		const resultId = termin.content?.wahleintraege?.find((w) => w.wahl.id === electionId)
			?.gebiet_link?.id;
		if (!resultId) {
			log(`Kreis ${ags}: Kreistagswahl nicht in termin.json, überspringe`, undefined, 'warn');
			continue;
		}
		const { content } = await fetchWithFallback<SitzeResponse>(
			`${base}/daten/api/wahl_${electionId}/ergebnis_${resultId}_0.json`,
			`${base}/api/praesentation/wahl_${electionId}/ergebnis_${resultId}_0.json`,
			fallbackOnNotFound
		);
		const table = content?.Komponente?.sitze?.tabelle;
		if (!table?.zeilen.length) {
			log(`Kreis ${ags}: keine Liste der Gewählten veröffentlicht, überspringe`, undefined, 'warn');
			continue;
		}
		// Some Kreise (2019) name only the members of some Wahlkreise; the other Wahlkreise' Gemeinden
		// then have no elected rows at all and stay "unknown" in election_candidate — as they should.
		const seatTotal = (content?.Komponente?.sitze?.tortenDiagramm?.entries ?? []).reduce(
			(sum, e) => sum + e.sitze,
			0
		);
		if (seatTotal > table.zeilen.length)
			log(
				`Kreis ${ags}: nur ${table.zeilen.length} von ${seatTotal} Sitzen namentlich veröffentlicht`,
				undefined,
				'warn'
			);
		const col = (name: string) => table.ueberschriften.indexOf(name);
		const [listIdx, nameIdx, mandateIdx] = [col('Wahlvorschlag'), col('Bewerber'), col('Mandat')];
		const members = table.zeilen
			.filter((z) => z[nameIdx])
			.map((z) => ({
				list: z[listIdx] ?? null,
				name: z[nameIdx],
				mandate: z[mandateIdx]?.replaceAll('Gewählt', 'Direktmandat') ?? null
			}));

		// ponytail: matched by list + name within the Kreis — two namesakes on one list in different
		// Wahlkreise would both count as elected; match per Wahlkreis page if that ever shows up.
		const [row] = (await db.execute(sql`
			WITH m AS (
				SELECT * FROM json_to_recordset(${JSON.stringify(members)}::json)
					AS m(list text, name text, mandate text)
			),
			cand AS (
				SELECT DISTINCT er.rs, er.election_id, er.party_id, ep.name AS list,
					${nameKeySql(sql`er.candidate_name`)} AS key
				FROM election_result er
				JOIN elections e ON e.election_id = er.election_id AND e.rs = er.rs
				JOIN election_party ep ON ep.rs = er.rs AND ep.election_id = er.election_id
					AND ep.party_id = er.party_id AND ep.votetype_id = er.votetype_id
				WHERE e.election_type = ${KREISTAG} AND e.date = ${date} AND e.election_id = ${electionId}
					AND left(lpad(e.rs::text, 11, '0'), 4) = ${kreis}
			),
			matched AS (
				SELECT m.name, m.list, m.mandate, c.rs, c.election_id, c.party_id
				FROM m JOIN cand c ON c.key = ${nameKeySql(sql`m.name`)} AND c.list = m.list
			),
			ins AS (
				INSERT INTO election_elected_candidates
					(rs, election_type, date, election_id, party_id, name, mandate_type)
				SELECT rs, ${KREISTAG}, ${date}, election_id, party_id, name, mandate FROM matched
				ON CONFLICT DO NOTHING
			)
			SELECT count(DISTINCT (name, list))::int AS n FROM matched
		`)) as unknown as { n: number }[];
		const matched = row?.n ?? 0;
		total += matched;
		log(
			`Kreis ${ags}: ${matched} von ${members.length} Gewählten zugeordnet`,
			undefined,
			matched < members.length ? 'warn' : 'info'
		);
	}
	log(`${total} gewählte Kreisrätinnen und Kreisräte gespeichert`, undefined, 'ok');
}
