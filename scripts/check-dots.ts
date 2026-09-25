/**
 * Self-check for src/lib/map/dots.ts (no test framework in this repo).
 * Run with: bun run scripts/check-dots.ts
 */
import assert from 'node:assert/strict';
import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { makeDots, niceDotValue, type DotArea } from '../src/lib/map/dots';

assert.equal(niceDotValue(0), 1);
assert.equal(niceDotValue(50000), 1);
assert.equal(niceDotValue(50001), 2);
assert.equal(niceDotValue(6_300_000), 200); // Land-wide Bundestag: 126 → 200, ~31k dots
assert.equal(niceDotValue(1_000_000), 20);
assert.equal(niceDotValue(30001, 30000), 2);

// An L-shaped polygon, so the bbox has a hole that rejection sampling must skip.
const L: Feature<Polygon> = {
	type: 'Feature',
	properties: {},
	geometry: {
		type: 'Polygon',
		coordinates: [
			[
				[0, 0],
				[2, 0],
				[2, 1],
				[1, 1],
				[1, 2],
				[0, 2],
				[0, 0]
			]
		]
	}
};
const areas: DotArea[] = [
	{
		key: 'a',
		feature: L,
		parties: [
			{ name: 'X', color: '#ff0000', votes: 1000 },
			{ name: 'Y', color: '#0000ff', votes: 250 },
			{ name: 'Z', color: '#00ff00', votes: 3 } // 0.3 dots → 0 or 1
		]
	}
];
const a = makeDots(areas, 10);
const count = (party: string) => a.features.filter((f) => f.properties?.party === party).length;
assert.equal(count('X'), 100);
assert.equal(count('Y'), 25);
assert.ok(count('Z') <= 1);
// Every dot lies inside the (non-convex) polygon.
for (const f of a.features) assert.ok(booleanPointInPolygon(f.geometry.coordinates, L));
// Deterministic: same input → identical output.
assert.deepEqual(makeDots(areas, 10), a);
// Stochastic rounding keeps small parties in expectation: 0.3 dots over 1000 areas ≈ 300.
const many = Array.from({ length: 1000 }, (_, i) => ({
	key: `k${i}`,
	feature: L,
	parties: [{ name: 'Z', color: '#00ff00', votes: 3 }]
}));
const z = makeDots(many, 10).features.length;
assert.ok(z > 240 && z < 360, `stochastic rounding off: ${z}`);
console.log('dots ok');
