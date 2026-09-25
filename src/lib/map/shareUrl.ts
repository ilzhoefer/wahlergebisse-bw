/**
 * Shareable-link encoding of the Kartenansicht state as URL query parameters. Pure (no Svelte, no
 * DOM), so the page only has to read it once on load and write it back whenever the state changes.
 *
 *   ?wahl=2&datum=2025-02-23&stimme=z&modus=hochburg&partei=SPD&ebene=Kreis&gebiet=8115000000&wb=012-04&wk=258
 *
 * Everything is optional; unknown or malformed values are dropped, never thrown on, since links get
 * hand-edited and outlive the data they were made for.
 */
import type { MapInformationMode } from '$lib/server/map/queries';
import type { MapLevel } from '$lib/map/path';
import { KREISFREIE_STADT_RS } from '$lib/map/rs';

export type ShareEbene = 'Regierungsbezirk' | 'Kreis' | 'Gemeinde' | 'Wahlkreis';
/** The map's colouring modes: the server's, plus two the client builds itself (the server never
 * sees them) — Veränderung from two Hochburg queries, Punkte (dot density) from breakdowns. */
export type VisualMode = MapInformationMode | 'Veränderung' | 'Punkte';

export interface ShareState {
	wahl?: number;
	datum?: string;
	stimme?: '0' | '1';
	modus?: VisualMode;
	/** Comparison date for modus=veraenderung. */
	vergleich?: string;
	/** Left panel shows vote counts instead of shares. */
	werte?: 'absolut';
	partei?: string;
	ebene?: ShareEbene;
	/** rs of the focused Regierungsbezirk/Kreis/Gemeinde (level follows from the rs, see levelOfRs). */
	gebiet?: number;
	/** Stuttgart Wahlbezirk (AWBEZ_T) focused inside `gebiet`. */
	wb?: string;
	/** Selected Wahlkreis `ref` (only with ebene=Wahlkreis). */
	wk?: string;
}

const MODE_SLUGS: [string, VisualMode][] = [
	['staerkste', 'Stärkste Partei'],
	['zweite', '2. Stärkste Partei'],
	['beteiligung', 'Wahlbeteiligung'],
	['hochburg', 'Hochburg'],
	['splitting', 'Stimmensplitting'],
	['veraenderung', 'Veränderung'],
	['punkte', 'Punkte']
];
const EBENEN: ShareEbene[] = ['Regierungsbezirk', 'Kreis', 'Gemeinde', 'Wahlkreis'];

export function readShareParams(p: URLSearchParams): ShareState {
	const s: ShareState = {};
	const wahl = Number(p.get('wahl'));
	if (Number.isInteger(wahl) && wahl > 0) s.wahl = wahl;
	const datum = p.get('datum');
	if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) s.datum = datum;
	const vergleich = p.get('vergleich');
	if (vergleich && /^\d{4}-\d{2}-\d{2}$/.test(vergleich)) s.vergleich = vergleich;
	if (p.get('werte') === 'absolut') s.werte = 'absolut';
	const stimme = p.get('stimme');
	if (stimme === 'e' || stimme === 'z') s.stimme = stimme === 'e' ? '0' : '1';
	const modus = MODE_SLUGS.find(([slug]) => slug === p.get('modus'));
	if (modus) s.modus = modus[1];
	const partei = p.get('partei');
	if (partei) s.partei = partei;
	const ebene = EBENEN.find((e) => e === p.get('ebene'));
	if (ebene) s.ebene = ebene;
	const gebiet = Number(p.get('gebiet'));
	if (Number.isSafeInteger(gebiet) && gebiet > 0 && levelOfRs(gebiet)) s.gebiet = gebiet;
	const wb = p.get('wb');
	if (wb && /^\d{3}-\d{2}$/.test(wb)) s.wb = wb;
	const wk = p.get('wk');
	if (wk && /^\d+$/.test(wk)) s.wk = wk;
	return s;
}

export function writeShareParams(s: ShareState): string {
	const p = new URLSearchParams();
	if (s.wahl !== undefined) p.set('wahl', String(s.wahl));
	if (s.datum) p.set('datum', s.datum);
	if (s.vergleich) p.set('vergleich', s.vergleich);
	if (s.werte) p.set('werte', s.werte);
	if (s.stimme) p.set('stimme', s.stimme === '0' ? 'e' : 'z');
	const slug = MODE_SLUGS.find(([, mode]) => mode === s.modus)?.[0];
	if (slug && slug !== 'staerkste') p.set('modus', slug);
	if (s.partei) p.set('partei', s.partei);
	if (s.ebene) p.set('ebene', s.ebene);
	if (s.gebiet !== undefined) p.set('gebiet', String(s.gebiet));
	if (s.wb) p.set('wb', s.wb);
	if (s.wk) p.set('wk', s.wk);
	return p.toString();
}

/**
 * Which level an 11-digit BW rs names: Regierungsbezirk = 2 digits + zeros, Kreis = 4 digits +
 * zeros, else Gemeinde (see rsPrefix). Kreisfreie Städte look like a Kreis but are focused as their
 * Gemeinde, exactly like a map click on them. null for anything that isn't a BW rs.
 */
export function levelOfRs(rs: number): Exclude<MapLevel, 'Land' | 'Wahlbezirk'> | null {
	if (rs < 80000000000 || rs > 89999999999) return null;
	if (rs % 1e9 === 0) return 'Regierungsbezirk';
	if (KREISFREIE_STADT_RS.has(rs)) return 'Gemeinde';
	if (rs % 1e7 === 0) return 'Kreis';
	return 'Gemeinde';
}
