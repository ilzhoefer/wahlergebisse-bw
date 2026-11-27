/**
 * Self-check for fixC1Mojibake (src/lib/server/scraper/client.ts), with the byte patterns seen in
 * real komm.one data. Names are placeholders in the Mustermann style, never real people's.
 * Run with: bun run test
 */
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { fixC1Mojibake } from '../src/lib/server/scraper/client';

test('mojibake', async () => {
	assert.equal(fixC1Mojibake('\u008eeljka Bo\u009eena Mustermann'), 'Željka Božena Mustermann');
	assert.equal(fixC1Mojibake('Du\u009aan Mustermann'), 'Dušan Mustermann');
	assert.equal(fixC1Mojibake('Erika Musterm\u0081ller'), 'Erika Mustermüller');
	// Stray 0x81 next to a correct "ü" is dropped, not doubled.
	assert.equal(fixC1Mojibake('J\u0081ürgen Mustermann'), 'Jürgen Mustermann');
	// Undefined in Windows-1252 and ambiguous elsewhere: left alone.
	assert.equal(fixC1Mojibake('Max Mustermann\u008d'), 'Max Mustermann\u008d');
	assert.equal(fixC1Mojibake('Erika Mustermüller'), 'Erika Mustermüller');
	console.log('mojibake ok');
});
