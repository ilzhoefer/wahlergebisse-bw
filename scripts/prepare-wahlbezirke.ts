/**
 * One-off per election: the Wahlbezirk boundaries komm.one's result presentation draws for the few
 * cities that publish them (Landtagswahl 2026: 10 cities, see CITIES), written as
 * - `src/lib/geo/wahlbezirke-<date>.json`: every Urnenwahlbezirk, keyed like the imported polling
 *   stations (`AWBEZ_T` = stationKey, `gemeinde` = the city's rs) — what the map drills into;
 * - `src/lib/map/wahlbezirk-cities.json`: those cities' rs, per date, for the map's drill-down;
 * - `src/lib/server/scraper/wahlbezirk-postal/<date>.json`: per city, the Urnenwahlbezirke each
 *   Briefwahlbezirk serves, with their Wahlberechtigte mit Wahlschein (A2) as weights, so the crawl
 *   can spread its votes over them (see wahlbezirkAggregates.ts).
 *   Where komm.one draws the Briefwahlbezirk, that's the Urnenwahlbezirke inside it; otherwise those of
 *   the same Stadtteil/Stadtbezirk (the result CSV lists each area's districts right after it); failing
 *   that, the whole Gemeinde's in its Wahlkreis.
 *
 * Run with: bun run scripts/prepare-wahlbezirke.ts 2026-03-08
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import { fitToOutline, simplify, type Feature, type GeoJSON } from './geo-utils';
import { parseOpenDataCsv } from '../src/lib/server/scraper/kreisOpenData';
import { stationKey } from '../src/lib/server/scraper/statistikBw';

const KOMM_ONE = 'https://wahlergebnisse.komm.one';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The publications with Wahlbezirk polygons (found by probing all 44 Kreise and 940 Gemeinden). */
const STATISTIK_CSV = 'https://wahlen.statistik-bw.de/ltw26/ltw26-ergebnisse.csv';
const CITIES: Record<string, { rs: number; publication: string }[]> = {
	'2026-03-08': [
		{
			rs: 81110000000,
			publication: '21/produktion/8111000/0/20260308/landtagswahl_gemeinde_mit_kwl'
		},
		{
			rs: 82120000000,
			publication: '22/produktion/8212000/0/20260308/landtagswahl_gemeinde_mit_kwl'
		},
		{
			rs: 83110000000,
			publication: '23/produktion/8311000/freiburg_stadt/20260308/landtagswahl_gemeinde_mit_kwl'
		},
		{ rs: 82210000000, publication: '22/produktion/8221000/0/20260308/landtagswahl_kwl_1_wk' },
		{ rs: 81210000000, publication: '21/produktion/8121000/0/20260308/landtagswahl_kwl_1_wk' },
		{ rs: 82310000000, publication: '22/produktion/8231000/0/20260308/landtagswahl_kwl_1_wk' },
		{
			rs: 81160019019,
			publication: '21/produktion/8116019/0/20260308/landtagswahl_gemeinde_ohne_kwl'
		},
		{
			rs: 81275009076,
			publication: '21/produktion/8127076/0/20260308/landtagswahl_gemeinde_ohne_kwl'
		},
		{
			rs: 83355004043,
			publication: '23/produktion/8335043/0/20260308/landtagswahl_gemeinde_ohne_kwl'
		},
		{
			rs: 84160041041,
			publication: '24/produktion/8416041/0/20260308/landtagswahl_gemeinde_ohne_kwl'
		}
	]
};

const date = process.argv[2];
const cities = CITIES[date];
if (!cities) throw new Error(`usage: prepare-wahlbezirke.ts <${Object.keys(CITIES).join('|')}>`);

async function get(url: string): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.text();
}

/** Every area page of a publication except the single-district ones (which draw no map). */
async function areaPages(base: string): Promise<string[]> {
	const index = await get(`${base}/index.html`);
	const search = /data-suchindex-url="([^"]+)"/.exec(index)?.[1];
	const entries: { url: string }[] = search
		? JSON.parse(await get(`${base}/${search}`)).suchindex
		: [];
	return [
		index,
		...(await Promise.all(
			entries
				.map((e) => e.url)
				.filter((u) => !/(stimmbezirk|briefwahlbezirk)_/.test(u))
				.map((u) => get(`${base}/${u}`))
		))
	];
}

/** The Stimm-/Briefwahlbezirk polygons of every map on the publication's pages, deduplicated. */
async function districtPolygons(base: string): Promise<Map<string, Feature>> {
	const files = new Set((await areaPages(base)).flatMap((p) => p.match(/m_[0-9_]+\.json/g) ?? []));
	const out = new Map<string, Feature>();
	for (const file of files) {
		const raw = JSON.parse(await get(`${base}/${file}`)).geoJSON;
		const geo: GeoJSON = typeof raw === 'string' ? JSON.parse(raw) : raw;
		for (const f of geo.features)
			if (
				(f.properties.gebietstyp === 'STIMMBEZIRK' ||
					f.properties.gebietstyp === 'BRIEFWAHLBEZIRK') &&
				JSON.stringify(f.geometry.coordinates).includes('[[[') // Pforzheim ships a few empty ones
			)
				out.set(String(f.properties.gebietId), f);
	}
	return out;
}

/** The publication's "all areas" CSV (linked from its download page, whatever that's called), for
 * the hierarchy. */
async function areaCsv(base: string): Promise<Record<string, string>[]> {
	const index = await get(`${base}/index.html`);
	const pages = new Set(
		[...index.matchAll(/href="([\w-]+\.html)"/g)]
			.map((m) => m[1])
			.filter((p) => p !== 'index.html' && !p.startsWith('ergebnisse'))
	);
	for (const page of pages) {
		const html = await get(`${base}/${page}`);
		for (const [, href] of html.matchAll(/href="([^"#:]+\.csv)"/g)) {
			const csv = await get(`${base}/${href}`);
			if (csv.startsWith('Wahlkreisnummer;Wahlkreisname;AGS')) return parseOpenDataCsv(csv);
		}
	}
	throw new Error(`${base}: keine Gebiets-CSV gefunden`);
}

/** Urn/postal districts per AGS as the Statistisches Landesamt (and so the import) lists them,
 * "<Gebietsart> <key>" → its Wahlberechtigte mit Wahlschein (A2) and a display name ("001-01 VWA
 * Haus" — the number, unless the name already starts with it). */
async function officialDistricts(): Promise<
	Map<string, Map<string, { a2: number; name: string }>>
> {
	const csv = await get(STATISTIK_CSV);
	const out = new Map<string, Map<string, { a2: number; name: string }>>();
	for (const r of parseOpenDataCsv(csv))
		if (r.Gebietsart === 'URNENWAHLBEZIRK' || r.Gebietsart === 'BRIEFWAHLBEZIRK')
			out.set(
				r.AGS,
				(out.get(r.AGS) ?? new Map()).set(`${r.Gebietsart} ${stationKey(r.Gebietsnummer)}`, {
					a2: Number(r['Wahlberechtigte mit Wahlschein (A2)'] || 0),
					name: r.Gebietsname.startsWith(r.Bezirksnummer)
						? r.Gebietsname
						: `${r.Bezirksnummer} ${r.Gebietsname}`
				})
			);
	return out;
}

const outline = (rs: number): Feature => {
	const gemeinden: GeoJSON = JSON.parse(
		readFileSync(path.join(root, 'src/lib/geo/gemeinde.json'), 'utf-8')
	);
	return gemeinden.features.find((f) => Number(f.properties.rs) === rs)!;
};

const official = await officialDistricts();
const allFeatures: Feature[] = [];
const postal: Record<string, Record<string, Record<string, number>>> = {};

for (const { rs, publication } of cities) {
	const base = `${KOMM_ONE}/${publication}`;
	const ags = publication.split('/')[2].padStart(8, '0');
	const ownDistricts = official.get(ags) ?? new Map<string, { a2: number; name: string }>();
	const [polygons, rows] = await Promise.all([districtPolygons(base), areaCsv(base)]);
	const urn = [...polygons.values()].filter((f) => f.properties.gebietstyp === 'STIMMBEZIRK');
	const brief = new Map(
		[...polygons.values()]
			.filter((f) => f.properties.gebietstyp === 'BRIEFWAHLBEZIRK')
			.map((f) => [stationKey(String(f.properties.gebietNr)), f])
	);

	// Urn/postal districts of the CSV with their Wahlkreis and enclosing sub-Gemeinde area.
	let area = '';
	const districts: { key: string; postal: boolean; wk: string; area: string }[] = [];
	for (const r of rows) {
		if (['STADTTEIL', 'STADTBEZIRK', 'ORTSTEIL', 'GEMEINDE'].includes(r.Gebietsart))
			area = `${r.Gebietsart} ${r.Gebietsnummer}`;
		// Only this Gemeinde's: Freiburg's CSV also lists the rest of its Wahlkreis ("47extern").
		if (ownDistricts.has(`${r.Gebietsart} ${stationKey(r.Gebietsnummer)}`))
			districts.push({
				key: stationKey(r.Gebietsnummer),
				postal: r.Gebietsart === 'BRIEFWAHLBEZIRK',
				wk: r.Wahlkreisnummer,
				area
			});
	}
	const urnDistricts = districts.filter((d) => !d.postal);
	const urnKeys = new Set(urn.map((f) => stationKey(String(f.properties.gebietNr))));
	const missing = [...ownDistricts.keys()].filter(
		(d) => d.startsWith('URNENWAHLBEZIRK ') && !urnKeys.has(d.slice('URNENWAHLBEZIRK '.length))
	);
	// Not drawn, but still counted in every total above Wahlbezirk level.
	if (missing.length) console.warn(`${rs}: ohne Polygon: ${missing.join(', ')}`);
	if (districts.length !== ownDistricts.size)
		throw new Error(
			`${rs}: ${ownDistricts.size - districts.length} Wahlbezirke fehlen in der Gebiets-CSV`
		);

	// Urn polygons with their area and bbox, for "which Briefwahlbezirk is it (mostly) in". (A single
	// interior point isn't enough: turf's pointOnFeature can return a vertex on a shared border.)
	const urnShapes = urn.map((f) => ({
		key: stationKey(String(f.properties.gebietNr)),
		f,
		area: turf.area(f as never),
		bbox: turf.bbox(f as never)
	}));
	const overlaps = (a: number[], b: number[]) =>
		a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
	const inside = (shape: Feature) => {
		const box = turf.bbox(shape as never);
		return urnShapes
			.filter((u) => overlaps(u.bbox, box))
			.filter((u) => {
				const hit = turf.intersect(turf.featureCollection([u.f, shape] as never));
				return hit !== null && turf.area(hit) > u.area / 2;
			})
			.map((u) => u.key);
	};
	const catchments: Record<string, Record<string, number>> = {};
	const how = { polygon: 0, area: 0, gemeinde: 0 };
	for (const d of districts.filter((d) => d.postal)) {
		const shape = brief.get(d.key);
		let keys = shape ? inside(shape) : [];
		if (keys.length > 0) how.polygon++;
		else {
			keys = urnDistricts.filter((u) => u.area === d.area && u.wk === d.wk).map((u) => u.key);
			if (keys.length > 0) how.area++;
			else {
				keys = urnDistricts.filter((u) => u.wk === d.wk).map((u) => u.key);
				how.gemeinde++;
			}
		}
		// Weighted by where the postal voters live: each urn district's voters with a Wahlschein.
		catchments[d.key] = Object.fromEntries(
			keys.map((k) => [k, ownDistricts.get(`URNENWAHLBEZIRK ${k}`)?.a2 ?? 0])
		);
	}
	postal[rs] = catchments;

	const simplified = fitToOutline(
		await simplify({ type: 'FeatureCollection', features: urn }, 30),
		outline(rs)
	);
	for (const f of simplified.features) {
		const key = stationKey(String(f.properties.gebietNr));
		allFeatures.push({
			...f,
			properties: {
				AWBEZ_T: key,
				name: ownDistricts.get(`URNENWAHLBEZIRK ${key}`)?.name ?? String(f.properties.name),
				gemeinde: rs
			}
		});
	}
	console.log(
		`${rs}: ${urn.length} Urnenwahlbezirke, Briefwahl über Polygon ${how.polygon}, Stadtteil ${how.area}, Gemeinde ${how.gemeinde}`
	);
}

const keys = allFeatures.map((f) => f.properties.AWBEZ_T);
if (new Set(keys).size !== keys.length) throw new Error('Wahlbezirk-Schlüssel nicht eindeutig');

const geoFile = path.join(root, `src/lib/geo/wahlbezirke-${date}.json`);
writeFileSync(geoFile, JSON.stringify({ type: 'FeatureCollection', features: allFeatures }));
// Which Gemeinden the map can open into Wahlbezirke, per date (read by src/lib/map/geoUrls.ts).
const citiesFile = path.join(root, 'src/lib/map/wahlbezirk-cities.json');
const cityIndex: Record<string, number[]> = JSON.parse(readFileSync(citiesFile, 'utf-8'));
cityIndex[date] = cities.map((c) => c.rs);
writeFileSync(citiesFile, JSON.stringify(cityIndex, null, '\t') + '\n');
const postalDir = path.join(root, 'src/lib/server/scraper/wahlbezirk-postal');
mkdirSync(postalDir, { recursive: true });
writeFileSync(path.join(postalDir, `${date}.json`), JSON.stringify(postal, null, '\t') + '\n');
console.log(
	`wrote ${path.relative(root, geoFile)} (${allFeatures.length} features, ${(JSON.stringify(allFeatures).length / 1024).toFixed(0)} KiB)`
);
