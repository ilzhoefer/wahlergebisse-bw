/**
 * The Kartenansicht's drill hierarchy — a fixed Land → Regierungsbezirk → Kreis → Gemeinde →
 * Wahlbezirk chain of levels, keyed by real `rs` values rather than the click-dummy's synthetic grid
 * ids (`Klickdummy Kartenansicht.dc.html`). Unlike the click-dummy's single linear `path`, the
 * Kartenansicht page tracks every independently drilled-into region at once (see its `expanded`
 * state) plus one `focused` region the panel shows stats for. `Wahlbezirk` only exists under
 * the Gemeinden with Wahlbezirk boundaries for the election (see `hasChildren`); every other
 * Gemeinde is a leaf.
 */
export type MapLevel = 'Land' | 'Regierungsbezirk' | 'Kreis' | 'Gemeinde' | 'Wahlbezirk';

export interface PathEntry {
	level: MapLevel;
	/** null only for the Land root, which has no rs of its own. For a Wahlbezirk entry, the rs of the
	 * Gemeinde it belongs to — the specific polling station is `stationKey`. */
	rs: number | null;
	/** Set only when `level === 'Wahlbezirk'`: the AWBEZ_T key ("001-01") of the one selected
	 * polling station (a Wahlbezirk is always a leaf, so this is only ever written by a leaf click, not
	 * by drilling in — see the Kartenansicht page's `handleFeatureClick`). */
	stationKey?: string;
	name: string;
}

const LEVEL_ORDER: MapLevel[] = ['Land', 'Regierungsbezirk', 'Kreis', 'Gemeinde', 'Wahlbezirk'];

export function childLevel(level: MapLevel): MapLevel | null {
	const i = LEVEL_ORDER.indexOf(level);
	return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
}

/** Whether a scope has anything to drill into. `bezirkGemeinden`: the Gemeinden with Wahlbezirk
 * boundaries for the election (see geoUrls' wahlbezirkGemeinden) — every other one is a leaf. */
export function hasChildren(
	level: MapLevel,
	rs: number | null,
	bezirkGemeinden: ReadonlySet<number>
): boolean {
	if (level === 'Wahlbezirk') return false;
	if (level === 'Gemeinde') return rs !== null && bezirkGemeinden.has(rs);
	return true;
}

export const LAND_ROOT: PathEntry = { level: 'Land', rs: null, name: 'Baden-Württemberg' };
