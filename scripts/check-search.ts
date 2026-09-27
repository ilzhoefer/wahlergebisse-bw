/**
 * Self-check for src/lib/map/search.ts (no test framework in this repo).
 * Run with: bun run scripts/check-search.ts
 */
import assert from 'node:assert/strict';
import { normalize, searchPlaces, type Place } from '../src/lib/map/search';

const p = (name: string, level: Place['level'] = 'Gemeinde'): Place => ({
	rs: name.length,
	name,
	level,
	parent: ''
});
const places = [
	p('Ulm'),
	p('Ulmer Vorstadt'),
	p('Neu-Ulm'),
	p('Überlingen'),
	p('Landkreis Ludwigsburg', 'Kreis'),
	p('Ludwigsburg'),
	p('Weißenstein'),
	p('Freiburg im Breisgau')
];
const names = (q: string) => searchPlaces(places, q).map((x) => x.name);

assert.equal(normalize('Überlingen Straße'), 'uberlingen strasse');
// Too short → nothing.
assert.deepEqual(names('u'), []);
// Prefix beats word-prefix; shorter name first among equals.
assert.deepEqual(names('ulm'), ['Ulm', 'Ulmer Vorstadt', 'Neu-Ulm']);
// Accent/ß-insensitive both ways.
assert.deepEqual(names('uberl'), ['Überlingen']);
assert.deepEqual(names('weiss'), ['Weißenstein']);
// Word prefix finds the Landkreis after the Stadt.
assert.deepEqual(names('ludwigsb'), ['Ludwigsburg', 'Landkreis Ludwigsburg']);
// Substring match ranks last.
assert.deepEqual(names('reisg'), ['Freiburg im Breisgau']);
// Limit is respected.
assert.equal(searchPlaces(places, 'l', 2).length, 0);
assert.equal(searchPlaces([...places, ...places], 'ulm', 2).length, 2);
console.log('search ok');
