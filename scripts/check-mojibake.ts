/**
 * Self-check for fixC1Mojibake (src/lib/server/scraper/client.ts), with the byte patterns seen in
 * real komm.one data (names made up). Run with: bun run scripts/check-mojibake.ts
 */
import assert from 'node:assert/strict';
import { fixC1Mojibake } from '../src/lib/server/scraper/client';

assert.equal(fixC1Mojibake('Ne\u009ea \u008eupan'), 'Neža Župan');
assert.equal(fixC1Mojibake('Du\u009aan Mustermann'), 'Dušan Mustermann');
assert.equal(fixC1Mojibake('Erika Musterm\u0081ller'), 'Erika Mustermüller');
// Stray 0x81 next to a correct "ü" is dropped, not doubled.
assert.equal(fixC1Mojibake('J\u0081ürgen Mustermann'), 'Jürgen Mustermann');
// Undefined in Windows-1252 and ambiguous elsewhere: left alone.
assert.equal(fixC1Mojibake('Max Mustermann\u008d'), 'Max Mustermann\u008d');
assert.equal(fixC1Mojibake('Erika Müller'), 'Erika Müller');
console.log('mojibake ok');
