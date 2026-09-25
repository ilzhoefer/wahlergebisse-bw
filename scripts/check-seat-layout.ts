/**
 * Self-check for src/lib/map/seatLayout.ts (no test framework in this repo).
 * Run with: bun run scripts/check-seat-layout.ts
 */
import assert from 'node:assert/strict';
import { seatLayout, seatRows, spectrumRank } from '../src/lib/map/seatLayout';

assert.deepEqual(seatRows(0), []);
for (let total = 1; total <= 150; total++) {
	const rows = seatRows(total);
	assert.equal(
		rows.reduce((a, b) => a + b, 0),
		total,
		`rows sum for ${total}`
	);
	// Outer rows are longer, so never hold fewer seats than inner ones.
	for (let i = 1; i < rows.length; i++) assert.ok(rows[i] >= rows[i - 1], `row order for ${total}`);

	const { dots, dotRadius } = seatLayout(total);
	assert.equal(dots.length, total, `dot count for ${total}`);
	assert.ok(dotRadius > 0);
	// Left→right: x of the first dot is never right of the last.
	assert.ok(dots[0].x <= dots[dots.length - 1].x);
	for (const d of dots) assert.ok(Math.hypot(d.x, d.y) <= 1 + 1e-9 && d.y <= 1e-9);
}
// No two dots overlap.
for (const total of [8, 26, 48, 60, 100]) {
	const { dots, dotRadius } = seatLayout(total);
	for (let i = 0; i < dots.length; i++)
		for (let j = i + 1; j < dots.length; j++)
			assert.ok(
				Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) >= 2 * dotRadius,
				`overlap at ${total}`
			);
}
assert.ok(spectrumRank('DIE LINKE') < spectrumRank('CDU'));
assert.equal(spectrumRank('Unbekannte Liste'), spectrumRank('FREIE WÄHLER'));
console.log('seatLayout ok');
