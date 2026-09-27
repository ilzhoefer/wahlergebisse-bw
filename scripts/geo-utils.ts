/** Geometry helpers shared by the one-off geo preparation scripts (prepare-geo-data.ts,
 * prepare-wahlbezirke.ts). */
import * as turf from '@turf/turf';
// @ts-expect-error -- mapshaper ships no types
import mapshaper from 'mapshaper';

export type GeoJSON = { type: string; features: Feature[] };
export type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: Geometry };
export type Geometry = { type: string; coordinates: unknown };
type TurfPoly = import('geojson').Feature<
	import('geojson').Polygon | import('geojson').MultiPolygon
>;

/** `clean`: extra mapshaper commands run before simplifying (see the Landtag file). */
export async function simplify(geojson: GeoJSON, percentage: number, clean = ''): Promise<GeoJSON> {
	const input = JSON.stringify(geojson);
	const output = await new Promise<Record<string, Buffer>>((resolve, reject) => {
		mapshaper.applyCommands(
			// Adjacent municipalities in this source are independently-digitized OSM relations whose
			// shared border doesn't always land on exactly the same coordinates — without `-snap` (run
			// *before* simplifying, so mapshaper's topology engine treats the now-merged vertices as one
			// shared arc from that point on), those near-misses show up as thin gap/sliver polygons
			// between neighbours once rendered, most visible at fine (Gemeinde) resolution.
			`-i in.json -snap ${clean} -simplify ${percentage}% keep-shapes -clean -o format=geojson precision=0.000001 out.json`,
			{ 'in.json': input },
			(err: Error | null, out: Record<string, Buffer>) => (err ? reject(err) : resolve(out))
		);
	});
	return JSON.parse(output['out.json'].toString());
}

/**
 * Wahlbezirke come from the cities' own data, not OSM, so their outer edge only roughly
 * follows the OSM Stuttgart outline the neighbouring Gemeinde/Kreis polygons use — leaving overhangs
 * and gaps where the two meet on the map. Fit them to the (already simplified) OSM outline: clip every
 * Bezirk to it, then hand each leftover gap piece to the Bezirk it touches most.
 */
export function fitToOutline(bezirke: GeoJSON, outline: Feature): GeoJSON {
	const fc = (...fs: unknown[]) => turf.featureCollection(fs as TurfPoly[]);
	const clipped = bezirke.features
		.map((f) => {
			const cut = turf.intersect(fc(f, outline));
			// Rounded, or polyclip's union below can trip over near-coincident edges.
			return cut && { ...f, geometry: turf.truncate(cut, { precision: 6 }).geometry as Geometry };
		})
		.filter((f): f is Feature => f !== null);

	let gaps: ReturnType<typeof turf.difference> = null;
	try {
		const covered = turf.union(fc(...clipped));
		gaps = covered && turf.difference(fc(outline, covered));
	} catch (err) {
		// Gap filling is cosmetic — keep the clipped Bezirke rather than fail the whole run.
		console.warn(`fitToOutline: Lücken nicht gefüllt (${(err as Error).message})`);
	}
	if (gaps) {
		for (const piece of turf.flatten(gaps).features) {
			// ponytail: "touches most" = largest overlap with the piece grown by 25 m; fine for border
			// slivers, a real shared-edge-length metric if a piece ever lands in the wrong Bezirk.
			const probe = turf.buffer(piece, 0.025, { units: 'kilometers' });
			let best: Feature | null = null;
			let bestArea = 0;
			for (const f of clipped) {
				const hit = turf.intersect(fc(f, probe));
				const area = hit ? turf.area(hit) : 0;
				if (area > bestArea) [best, bestArea] = [f, area];
			}
			if (best) best.geometry = turf.union(fc(best, piece))!.geometry as Geometry;
		}
	}
	return turf.truncate({ type: 'FeatureCollection', features: clipped } as never, {
		precision: 6
	}) as unknown as GeoJSON;
}
