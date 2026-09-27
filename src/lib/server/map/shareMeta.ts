/**
 * Title/description of a shared map link, rendered server-side so messengers and search engines see
 * what the link shows ("Landtagswahl 8.3.2026 · Landkreis Tübingen", "Hochburg SPD · Zweitstimmen").
 * Mirrors the defaults the map page applies on load (newest election, "Stärkste Partei").
 */
import { eq } from 'drizzle-orm';
import type { db as Db } from '$lib/server/db';
import { cities } from '$lib/server/db/schema';
import { levelOfRs, type ShareState } from '$lib/map/shareUrl';
import { visualModeLabel } from '$lib/map/visualModes';
import * as m from '$lib/paraglide/messages';
import names from './region-names.json';

export interface PageMetaData {
	title: string;
	description: string;
}

/** "Stuttgart, Landeshauptstadt" → "Stuttgart" (cities.name carries the official suffix). */
export const shortCityName = (name: string) => name.split(',')[0].trim();

export const formatDate = (date: string) => new Date(date).toLocaleDateString('de-DE');

async function regionName(db: typeof Db, shared: ShareState): Promise<string | null> {
	if (shared.ebene === 'Wahlkreis' && shared.wk) {
		const byRef = shared.wahl === 2 ? names.wahlkreisBundestag : names.wahlkreisLandtag;
		return (byRef as Record<string, string>)[shared.wk] ?? null;
	}
	if (shared.gebiet === undefined) return null;
	if (levelOfRs(shared.gebiet) !== 'Gemeinde')
		return (names.regions as Record<string, string>)[String(shared.gebiet)] ?? null;
	const [row] = await db
		.select({ name: cities.name })
		.from(cities)
		.where(eq(cities.rs, shared.gebiet));
	return row?.name ? shortCityName(row.name) : null;
}

export async function mapShareMeta(
	db: typeof Db,
	shared: ShareState,
	electionTypes: { electionType: number; electionDescription: string }[],
	datesByType: Record<number, string[]>
): Promise<PageMetaData> {
	const newest = (t: number) => (datesByType[t] ?? []).reduce((a, b) => (b > a ? b : a), '');
	const type =
		electionTypes.find((t) => t.electionType === shared.wahl) ??
		electionTypes.reduce<(typeof electionTypes)[number] | undefined>(
			(best, t) => (!best || newest(t.electionType) > newest(best.electionType) ? t : best),
			undefined
		);
	const brand = `${m.map_brand_name()} ${m.map_brand_region()}`;
	if (!type) return { title: brand, description: m.meta_map_description_default() };

	const dates = datesByType[type.electionType] ?? [];
	const date =
		shared.datum && dates.includes(shared.datum) ? shared.datum : newest(type.electionType);
	const region = await regionName(db, { ...shared, wahl: type.electionType });

	const mode = shared.modus ?? 'Stärkste Partei';
	const view = [
		mode === 'Hochburg' || mode === 'Veränderung' || mode === 'Stimmensplitting'
			? [visualModeLabel(mode), shared.partei].filter(Boolean).join(' ')
			: visualModeLabel(mode),
		mode === 'Veränderung' && shared.vergleich
			? m.meta_compared_to({ date: formatDate(shared.vergleich) })
			: null,
		shared.stimme === '1' ? m.map_zweitstimmen() : null
	]
		.filter(Boolean)
		.join(' · ');

	const election = `${type.electionDescription} ${date ? formatDate(date) : ''}`.trim();
	return {
		title: [election, region].filter(Boolean).join(' · ') + ` – ${brand}`,
		description: m.meta_map_description({ view })
	};
}
