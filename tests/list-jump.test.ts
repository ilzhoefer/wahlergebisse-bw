// Self-check for src/lib/map/listJump.ts. Run with: bun run test
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { listOutcome } from '../src/lib/map/listJump';

test('list-jump', async () => {
	// A list with 3 seats: places 1-3 are "safe" by ballot order.
	assert.equal(listOutcome(2, true, 3), null); // elected as listed
	assert.equal(listOutcome(5, true, 3), 'jumped'); // elected from place 5
	assert.equal(listOutcome(3, false, 3), 'pushedOut'); // place 3 lost the seat
	assert.equal(listOutcome(7, false, 3), null); // not elected, never in reach
	assert.equal(listOutcome(1, false, 0), null); // list won no seat
	console.log('listJump ok');
});
