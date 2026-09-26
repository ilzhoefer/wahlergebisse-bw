/**
 * Self-check for src/lib/map/shareUrl.ts (no test framework in this repo).
 * Run with: bun run scripts/check-share-url.ts
 */
import assert from 'node:assert/strict';
import { readShareParams, writeShareParams, levelOfRs } from '../src/lib/map/shareUrl';

const full = {
	wahl: 2,
	datum: '2025-02-23',
	stimme: '1',
	modus: 'Hochburg',
	partei: 'SPD',
	gebiet: 81110000000,
	wb: '012-04'
} as const;
// Round trip.
assert.deepEqual(readShareParams(new URLSearchParams(writeShareParams(full))), full);
// A Wahlbezirk outside Stuttgart (komm.one key, since 2026).
const heidelberg = { wahl: 3, datum: '2026-03-08', gebiet: 82210000000, wb: '08221000-001.01' };
assert.deepEqual(readShareParams(new URLSearchParams(writeShareParams(heidelberg))), heidelberg);
// Ebene and a focused region together (the Ebene stays the map's base grain while drilling).
const ebeneAndGebiet = { wahl: 6, ebene: 'Gemeinde', gebiet: 81275009076 } as const;
assert.deepEqual(
	readShareParams(new URLSearchParams(writeShareParams(ebeneAndGebiet))),
	ebeneAndGebiet
);
// Default mode is omitted from the URL.
assert.equal(writeShareParams({ wahl: 1, modus: 'Stärkste Partei' }), 'wahl=1');
// Stimmensplitting round trip.
assert.equal(
	writeShareParams({ wahl: 2, modus: 'Stimmensplitting', partei: 'CDU' }),
	'wahl=2&modus=splitting&partei=CDU'
);
assert.equal(readShareParams(new URLSearchParams('modus=splitting')).modus, 'Stimmensplitting');
// Veränderung with its comparison date.
assert.equal(
	writeShareParams({ wahl: 2, datum: '2025-02-23', vergleich: '2021-09-26', modus: 'Veränderung' }),
	'wahl=2&datum=2025-02-23&vergleich=2021-09-26&modus=veraenderung'
);
assert.deepEqual(
	readShareParams(new URLSearchParams('modus=veraenderung&vergleich=2021-09-26&partei=CDU')),
	{ modus: 'Veränderung', vergleich: '2021-09-26', partei: 'CDU' }
);
// Absolute vote counts in the panel.
assert.equal(writeShareParams({ wahl: 2, werte: 'absolut' }), 'wahl=2&werte=absolut');
assert.equal(readShareParams(new URLSearchParams('werte=absolut')).werte, 'absolut');
assert.equal(readShareParams(new URLSearchParams('werte=xyz')).werte, undefined);
// Dot map.
assert.equal(writeShareParams({ wahl: 2, modus: 'Punkte' }), 'wahl=2&modus=punkte');
assert.equal(readShareParams(new URLSearchParams('modus=punkte')).modus, 'Punkte');
// Garbage is dropped, not thrown on.
assert.deepEqual(
	readShareParams(
		new URLSearchParams(
			'wahl=abc&datum=2025&vergleich=2021&stimme=x&modus=foo&ebene=Land&gebiet=123&wb=x&wk=a'
		)
	),
	{}
);
// rs → level.
assert.equal(levelOfRs(81000000000), 'Regierungsbezirk');
assert.equal(levelOfRs(81150000000), 'Kreis');
assert.equal(levelOfRs(81110000000), 'Gemeinde'); // Stuttgart: kreisfreie Stadt
assert.equal(levelOfRs(81155004012), 'Gemeinde');
assert.equal(levelOfRs(91150000000), null);
console.log('shareUrl ok');
