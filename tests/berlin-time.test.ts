// Self-check for src/lib/berlinTime.ts. Run with: bun run test
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { fromBerlinLocal, toBerlinLocal } from '../src/lib/berlinTime';

test('berlin-time', async () => {
	// Winter (UTC+1) and summer (UTC+2).
	assert.equal(fromBerlinLocal('2026-03-08T18:00')?.toISOString(), '2026-03-08T17:00:00.000Z');
	assert.equal(fromBerlinLocal('2024-06-09T18:00')?.toISOString(), '2024-06-09T16:00:00.000Z');
	// Just after the spring-forward switch (29.3.2026, 02:00 → 03:00).
	assert.equal(fromBerlinLocal('2026-03-29T03:30')?.toISOString(), '2026-03-29T01:30:00.000Z');
	// Round trip.
	for (const s of ['2026-03-08T18:00', '2024-06-09T23:59', '2025-10-26T12:00'])
		assert.equal(toBerlinLocal(fromBerlinLocal(s)!), s);
	assert.equal(fromBerlinLocal('2026-03-08 18:00'), null);
	assert.equal(fromBerlinLocal(''), null);
	console.log('berlinTime ok');
});
