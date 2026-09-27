/**
 * Who represents each Baden-Württemberg Bundestags-/Landtags-Wahlkreis — official data prepared per
 * election by scripts/prepare-bundestag-mandates.ts / prepare-landtag-mandates.ts into
 * `mandates/<date>.json`. Elections without a file simply have no mandate data.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionVoteDistrictMapping, pollingStations } from '$lib/server/db/schema';

export interface WahlkreisMandates {
	districtId: string;
	/** The Erststimme winner; `seat: false` = no seat for lack of Zweitstimmendeckung. */
	direct: { name: string | null; party: string; percent: number | null; seat: boolean } | null;
	/** Candidates of this Wahlkreis elected via their party's Landesliste. */
	list: { name: string; party: string; listPlace: number | null }[];
}

type MandateFile = Record<string, Omit<WahlkreisMandates, 'districtId'>>;

const files = import.meta.glob<MandateFile>('./mandates/*.json', {
	eager: true,
	import: 'default'
});

export function getWahlkreisMandates(date: string): WahlkreisMandates[] {
	const file = files[`./mandates/${date}.json`];
	return file ? Object.entries(file).map(([districtId, m]) => ({ districtId, ...m })) : [];
}

/** Wahlkreis → the Gemeinden (rs, stringified) it covers, so a Gemeinde's panel can name its
 * members. Gemeinden split across several Wahlkreise (Stuttgart, Mannheim, …) are in each. */
export async function getWahlkreisGemeinden(
	db: typeof DbType,
	electionType: number,
	date: string
): Promise<Map<string, string[]>> {
	const rows = await db
		.selectDistinct({
			rs: electionVoteDistrictMapping.rs,
			districtId: electionVoteDistrictMapping.districtId
		})
		.from(electionVoteDistrictMapping)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, electionType),
				eq(electionVoteDistrictMapping.date, date)
			)
		);
	const byWk = new Map<string, string[]>();
	for (const { rs, districtId } of rows) {
		if (rs === null || districtId === null) continue;
		byWk.set(String(districtId), [...(byWk.get(String(districtId)) ?? []), String(rs)]);
	}
	return byWk;
}

/** Wahlkreis → the Wahlbezirke in it of Gemeinden spanning several Wahlkreise, by the key the
 * Wahlbezirk map uses ("001-01", the station name's first word), so a Wahlbezirk's panel can name its
 * members too. (A Gemeinde in one Wahlkreis is covered by getWahlkreisGemeinden.) */
export async function getWahlkreisBezirke(
	db: typeof DbType,
	electionType: number,
	date: string
): Promise<Map<string, string[]>> {
	const rows = await db
		.selectDistinct({
			districtId: electionVoteDistrictMapping.districtId,
			name: pollingStations.name
		})
		.from(electionVoteDistrictMapping)
		.innerJoin(
			elections,
			and(
				eq(elections.rs, electionVoteDistrictMapping.rs),
				eq(elections.date, electionVoteDistrictMapping.date),
				eq(elections.electionType, electionVoteDistrictMapping.electionType)
			)
		)
		.innerJoin(
			pollingStations,
			and(
				eq(pollingStations.rs, electionVoteDistrictMapping.rs),
				eq(pollingStations.electionId, elections.electionId),
				eq(pollingStations.psId, electionVoteDistrictMapping.psId)
			)
		)
		.where(
			and(
				eq(electionVoteDistrictMapping.electionType, electionType),
				eq(electionVoteDistrictMapping.date, date),
				isNotNull(electionVoteDistrictMapping.psId)
			)
		);
	const byWk = new Map<string, string[]>();
	for (const { districtId, name } of rows) {
		const nr = name?.split(' ')[0];
		if (districtId === null || !nr) continue;
		byWk.set(String(districtId), [...(byWk.get(String(districtId)) ?? []), nr]);
	}
	return byWk;
}
