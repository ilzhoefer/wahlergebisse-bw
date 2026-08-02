/**
 * All Baden-Württemberg `rs` values are 11 digits once the DB's bigint representation strips the
 * leading "0" every 12-digit Regionalschlüssel starts with (BW's Land code is "08"). Regierungsbezirk
 * rs = first 2 digits + zeros; Kreis rs = first 4 digits + zeros — this mirrors update_aggregate_party
 * on the server side exactly (see src/lib/server/map/queries.ts's module doc).
 */
export function rsPrefix(rs: number, digits: 2 | 4): string {
	return String(rs).padStart(11, '0').slice(0, digits);
}

export function isSameKreis(childRs: number, kreisRs: number): boolean {
	return rsPrefix(childRs, 4) === rsPrefix(kreisRs, 4);
}

export function isSameRegierungsbezirk(childRs: number, regierungsbezirkRs: number): boolean {
	return rsPrefix(childRs, 2) === rsPrefix(regierungsbezirkRs, 2);
}

/** Stuttgart's rs — the only municipality with a Wahlbezirk-level drill-down target. */
export const STUTTGART_RS = 81110000000;
