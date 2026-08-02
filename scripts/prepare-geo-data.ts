/**
 * One-off (re-run when the source GeoJSON changes) preprocessing of the boundary files inherited
 * from the R/Shiny app (Docker/shiny/data/*.geojson) into small, WGS84, per-admin-level files the
 * map view can fetch directly. See CLAUDE.md / the Phase 1 plan for why this is needed:
 * - Landtag_BW.geojson is in EPSG:31467 (Gauss-Krüger), everything else is WGS84 — must reproject.
 * - Baden_Wuerttemberg_small.geojson (~18MB) mixes three admin levels in one file — split by level
 *   (matching shiny_reactive_polygons' de:regionalschluessel-length classification) so the client
 *   only fetches the level currently selected.
 * - All source files are full-resolution OSM/official boundaries — simplified for on-screen use.
 *
 * Run with: bun run scripts/prepare-geo-data.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import proj4 from 'proj4';
// @ts-expect-error -- mapshaper ships no types
import mapshaper from 'mapshaper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../Docker/shiny/data');
const OUT = path.resolve(__dirname, '../static/geo');
mkdirSync(OUT, { recursive: true });

// EPSG:31467 = DHDN / Gauss-Krüger zone 3 (the source CRS of Landtag_BW.geojson).
const EPSG_31467 =
	'+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs';

type GeoJSON = { type: string; features: Feature[] };
type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: Geometry };
type Geometry = { type: string; coordinates: unknown };

function readGeoJSON(file: string): GeoJSON {
	return JSON.parse(readFileSync(path.join(SRC, file), 'utf-8'));
}

/** Recursively reprojects every [x, y(, z)] coordinate pair in a geometry's coordinate tree. */
function reprojectGeometry(
	coords: unknown,
	project: (xy: [number, number]) => [number, number]
): unknown {
	if (Array.isArray(coords) && typeof coords[0] === 'number') {
		const [x, y] = coords as number[];
		return project([x, y]);
	}
	if (Array.isArray(coords)) {
		return coords.map((c) => reprojectGeometry(c, project));
	}
	return coords;
}

function reprojectFeatureCollection(geojson: GeoJSON, fromProj: string): GeoJSON {
	const project = (xy: [number, number]) => proj4(fromProj, proj4.WGS84, xy);
	return {
		...geojson,
		features: geojson.features.map((f) => ({
			...f,
			geometry: { ...f.geometry, coordinates: reprojectGeometry(f.geometry.coordinates, project) }
		}))
	};
}

/** Keeps only the given property keys (renaming via the `rename` map first). */
function pickProperties(
	geojson: GeoJSON,
	keep: string[],
	rename: Record<string, string> = {}
): GeoJSON {
	return {
		...geojson,
		features: geojson.features.map((f) => {
			const renamed: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(f.properties)) {
				renamed[rename[k] ?? k] = v;
			}
			const picked: Record<string, unknown> = {};
			for (const k of keep) picked[k] = renamed[k];
			return { ...f, properties: picked };
		})
	};
}

async function simplify(geojson: GeoJSON, percentage: number): Promise<GeoJSON> {
	const input = JSON.stringify(geojson);
	const output = await new Promise<Record<string, Buffer>>((resolve, reject) => {
		mapshaper.applyCommands(
			`-i in.json -simplify ${percentage}% keep-shapes -clean -o format=geojson precision=0.000001 out.json`,
			{ 'in.json': input },
			(err: Error | null, out: Record<string, Buffer>) => (err ? reject(err) : resolve(out))
		);
	});
	return JSON.parse(output['out.json'].toString());
}

function write(name: string, geojson: GeoJSON) {
	const out = path.join(OUT, name);
	writeFileSync(out, JSON.stringify(geojson));
	console.log(
		`wrote ${name} (${geojson.features.length} features, ${(JSON.stringify(geojson).length / 1024).toFixed(0)} KiB)`
	);
}

async function main() {
	// --- Baden_Wuerttemberg_small.geojson: split by admin level via de:regionalschluessel length ---
	const bw = readGeoJSON('Baden_Wuerttemberg_small.geojson');
	const withRs = bw.features.map((f) => {
		const deRs = String(f.properties['de:regionalschluessel'] ?? '');
		// Matches app.R's str_pad(..., width = 12, side = "right", pad = "0") — right-padding a
		// GeoJSON de:regionalschluessel (which keeps a leading "0" for BW) to 12 chars yields the
		// same numeric value as the DB-side aggregate tables' rs, which right-pads the (leading-zero
		// -stripped) bigint rs string to 11 chars. Both represent the same integer once parsed.
		const rs = Number(deRs.padEnd(12, '0'));
		return { ...f, properties: { ...f.properties, rs, deRsLength: deRs.length } };
	});

	const regierungsbezirk = {
		type: 'FeatureCollection',
		features: withRs.filter((f) => f.properties.deRsLength === 3)
	};
	// Kreisfreie Städte (Stuttgart, Heilbronn, Baden-Baden, Karlsruhe, Mannheim, Pforzheim, Freiburg,
	// Heidelberg, Ulm) are their own Kreis, but OSM only tags them with their full 12-digit Gemeinde-
	// level de:regionalschluessel — there's no separate 5-digit Kreis relation for them — so the
	// deRsLength === 5 filter alone drops all 9 of them from the Kreis map entirely. Detect them among
	// the 12-digit features by rs already being "Kreis-prefix + zeros" (mirrors rsPrefix/isSameKreis in
	// src/lib/map/rs.ts): a Kreisfreie Stadt's Gemeindeverband+Gemeinde digits are all zero because the
	// whole Kreis is that one Gemeinde.
	const isKreisfreieStadt = (rs: number) =>
		Number(String(rs).padStart(11, '0').slice(0, 4).padEnd(11, '0')) === rs;
	const kreis = {
		type: 'FeatureCollection',
		features: withRs.filter(
			(f) =>
				f.properties.deRsLength === 5 ||
				(f.properties.deRsLength === 12 && isKreisfreieStadt(f.properties.rs as number))
		)
	};
	const gemeinde = {
		type: 'FeatureCollection',
		features: withRs.filter((f) => f.properties.deRsLength === 12)
	};

	write(
		'regierungsbezirk.geojson',
		pickProperties(await simplify(regierungsbezirk as GeoJSON, 20), ['rs', 'name'])
	);
	write('kreis.geojson', pickProperties(await simplify(kreis as GeoJSON, 15), ['rs', 'name']));
	write('gemeinde.geojson', pickProperties(await simplify(gemeinde as GeoJSON, 8), ['rs', 'name']));

	// --- Bundestag.geojson: Wahlkreis polygons for Bundestagswahl, keyed by `ref` ---
	const bundestag = readGeoJSON('Bundestag.geojson');
	write(
		'wahlkreis-bundestag.geojson',
		pickProperties(await simplify(bundestag, 15), ['ref', 'name'])
	);

	// --- Landtag_BW.geojson: Wahlkreis polygons for Landtagswahl, EPSG:31467 -> WGS84.
	// Also renamed "Nummer" -> "ref" and "WK Name" -> "name" so client code can treat both Wahlkreis
	// files uniformly (the source data has no shared property naming between the two elections).
	const landtag = reprojectFeatureCollection(readGeoJSON('Landtag_BW.geojson'), EPSG_31467);
	write(
		'wahlkreis-landtag.geojson',
		pickProperties(await simplify(landtag, 15), ['ref', 'name'], {
			Nummer: 'ref',
			'WK Name': 'name'
		})
	);

	// --- Stuttgart district boundaries: combine the three per-year files into one, tagged with the
	// date each version became effective (matching app.R's geo_stuttgart_combined rbind).
	// IMPORTANT: each year must be simplified *separately*, before combining. Simplifying the
	// already-combined multi-year set in one pass fed all three years into mapshaper's shared-topology
	// `-clean` step, which treated the heavily-overlapping same-geography polygons from different
	// years as duplicate/degenerate slivers and silently dropped most of them (2025 went from 265
	// features to 14 in testing). ---
	const stuttgartByDate: [string, string][] = [
		['Stuttgart_Bezirke_2021.geojson', '2021-09-26'],
		['Stuttgart_Bezirke_2024.geojson', '2024-06-09'],
		['Stuttgart_Bezirke_2025.geojson', '2025-02-23']
	];
	const stuttgartCombined: GeoJSON = { type: 'FeatureCollection', features: [] };
	for (const [file, date] of stuttgartByDate) {
		const geo = readGeoJSON(file);
		const simplified = await simplify(geo, 30);
		for (const f of simplified.features) {
			stuttgartCombined.features.push({ ...f, properties: { ...f.properties, date } });
		}
	}
	write(
		'stuttgart-bezirke.geojson',
		pickProperties(stuttgartCombined, ['AWBEZ_T', 'name', 'date'], { STBNAM_T: 'name' })
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
