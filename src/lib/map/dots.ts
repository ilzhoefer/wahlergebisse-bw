/**
 * Dot-density map ("Punktdichte"): each dot stands for `perDot` votes of one party, scattered at a
 * random spot inside its area. Pure (no DOM), so scripts/check-dots.ts can test it.
 *
 * Randomness is seeded per (area, party), so the same data always yields the same dots — they don't
 * jump around when the map re-renders or the user pans.
 */
import { bbox, booleanPointInPolygon } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

export interface DotArea {
	key: string;
	feature: Feature<Polygon | MultiPolygon>;
	parties: { name: string; color: string; votes: number }[];
}

/** Smallest "nice" value (1, 2, 5 × 10ⁿ) so that `totalVotes / value` stays at or under `target`. */
export function niceDotValue(totalVotes: number, target = 50000): number {
	const raw = Math.max(1, totalVotes / target);
	const pow = 10 ** Math.floor(Math.log10(raw));
	return [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw)!;
}

/** FNV-1a string hash → mulberry32 PRNG: small, fast, and good enough for scattering dots. */
function rng(seedText: string): () => number {
	let h = 0x811c9dc5;
	for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 0x01000193);
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** One Point per dot, with `color` and `party` properties. Dot counts use stochastic rounding
 * (floor plus one more with probability = the remainder), so small parties aren't systematically
 * rounded away. The result is shuffled, so no party is always drawn on top. */
export function makeDots(areas: DotArea[], perDot: number): FeatureCollection<Point> {
	const dots: Feature<Point>[] = [];
	for (const area of areas) {
		const [minX, minY, maxX, maxY] = bbox(area.feature);
		for (const party of area.parties) {
			const rand = rng(`${area.key}|${party.name}`);
			const exact = party.votes / perDot;
			const count = Math.floor(exact) + (rand() < exact - Math.floor(exact) ? 1 : 0);
			for (let i = 0; i < count; i++) {
				// Rejection sampling in the bbox; the cap guards against degenerate (near-empty) shapes.
				for (let tries = 0; tries < 200; tries++) {
					const p: [number, number] = [
						minX + rand() * (maxX - minX),
						minY + rand() * (maxY - minY)
					];
					if (booleanPointInPolygon(p, area.feature)) {
						dots.push({
							type: 'Feature',
							properties: { color: party.color, party: party.name },
							geometry: { type: 'Point', coordinates: p }
						});
						break;
					}
				}
			}
		}
	}
	const shuffle = rng('shuffle');
	for (let i = dots.length - 1; i > 0; i--) {
		const j = Math.floor(shuffle() * (i + 1));
		[dots[i], dots[j]] = [dots[j], dots[i]];
	}
	return { type: 'FeatureCollection', features: dots };
}
