// Self-check for the Land-wide sum in src/lib/map/breakdown.ts. Run with: bun run test
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { sumBreakdowns, toRows } from '../src/lib/map/breakdown';

test('breakdown', async () => {
	const row = (partyName: string, voteCount: number) => ({
		partyName,
		color: null,
		voteCount,
		votePercent: null,
		seats: null,
		candidate: null
	});

	// Shares come from summed votes and turnout is weighted by eligible voters, not averaged.
	const land = sumBreakdowns([
		{ key: 'a', turnout: 50, eligible: 100, seatTotal: null, rows: [row('A', 30), row('B', 10)] },
		{ key: 'b', turnout: 80, eligible: 300, seatTotal: null, rows: [row('B', 60)] }
	]);
	assert.equal(land.turnout, 72.5);
	assert.equal(land.eligible, 400);
	assert.deepEqual(
		land.rows.map((r) => [r.partyName, r.voteCount, r.votePercent]),
		[
			['B', 70, 70],
			['A', 30, 30]
		]
	);

	// Bars scale to the largest share; the label uses German decimals.
	const rows = toRows(land, 1);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].widthPercent, 100);
	assert.equal(rows[0].pct, '70,0 %');

	console.log('breakdown ok');
});
