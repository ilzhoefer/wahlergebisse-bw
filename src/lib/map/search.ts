/**
 * Client-side place search for the map's search box (Gemeinden, Kreise, Regierungsbezirke from the
 * geo files). Pure, so scripts/check-search.ts can test it.
 */
import type { MapLevel } from '$lib/map/path';

export interface Place {
	rs: number;
	name: string;
	level: MapLevel;
	/** Disambiguating context shown under the name, e.g. the Kreis of a Gemeinde. */
	parent: string;
}

/** Case-, accent- and ß-insensitive form: "Überlingen" and "uberlingen" match, "Straße" ~ "strasse". */
export function normalize(s: string): string {
	return s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Best matches first: name starts with the query, then a later word does, then it's contained
 * anywhere; ties go to the shorter name ("Ulm" before "Ulmer …"), then alphabetical. */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
	const q = normalize(query.trim());
	if (q.length < 2) return [];
	const scored: { place: Place; rank: number }[] = [];
	for (const place of places) {
		const n = normalize(place.name);
		const rank = n.startsWith(q)
			? 0
			: n.split(/[\s\-()/.]+/).some((w) => w.startsWith(q))
				? 1
				: n.includes(q)
					? 2
					: -1;
		if (rank >= 0) scored.push({ place, rank });
	}
	return scored
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				a.place.name.length - b.place.name.length ||
				a.place.name.localeCompare(b.place.name, 'de')
		)
		.slice(0, limit)
		.map((s) => s.place);
}
