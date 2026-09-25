/**
 * Who represents each Baden-Württemberg Bundestags-Wahlkreis — official data from the
 * Bundeswahlleiterin, prepared per election by scripts/prepare-bundestag-mandates.ts into
 * `mandates/<date>.json`. Elections without a file simply have no mandate data.
 */
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
