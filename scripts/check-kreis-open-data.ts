/**
 * Self-check for the pure helpers in src/lib/server/scraper/kreisOpenData.ts.
 * Run with: bun run scripts/check-kreis-open-data.ts
 */
import assert from 'node:assert/strict';
import {
	normalizeGemeindeName as n,
	parseOpenDataCsv
} from '../src/lib/server/scraper/kreisOpenData';

// CSV spelling ↔ cities-table spelling.
assert.equal(n('Gemeinde Asselfingen'), n('Asselfingen'));
assert.equal(n('Stadt Schönau im Schwarzwald'), n('Schönau im Schwarzwald, Stadt'));
assert.equal(n('Gemeinde Altheim'), n('Altheim (Landkreis Alb-Donau-Kreis)'));
// …without merging different Gemeinden.
assert.notEqual(n('Gemeinde Altheim (Alb)'), n('Altheim (Landkreis Alb-Donau-Kreis)'));
assert.equal(n('Große Kreisstadt Ehingen (Donau)'), 'ehingen (donau)');

const rows = parseOpenDataCsv('gebiet-name;A;D1;F1;D7\r\nGemeinde X;100;40;;\r\n');
assert.deepEqual(rows, [{ 'gebiet-name': 'Gemeinde X', A: '100', D1: '40', F1: '', D7: '' }]);
console.log('kreisOpenData ok');
