/**
 * csvStream (src/lib/server/csv-export/csv.ts): header with BOM, RFC 4180 quoting, batching.
 * Run with: bun run test
 */
import { expect, test } from 'bun:test';
import { csvStream } from '../src/lib/server/csv-export/csv';

/** Written first so Excel reads the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
// Decoded with ignoreBOM, since Response.text() would strip the BOM the export deliberately writes.
const read = async (s: ReadableStream<Uint8Array>) =>
	new TextDecoder('utf-8', { ignoreBOM: true }).decode(await new Response(s).arrayBuffer());

test('header, BOM and quoting', async () => {
	const text = await read(
		csvStream(
			[1],
			async () => [
				{ rs: 1, name: 'Plain', note: null },
				{ rs: 1, name: 'Comma, "quoted"', note: 'two\nlines' }
			],
			['rs', 'name', 'note']
		)
	);
	expect(text).toBe(BOM + 'rs,name,note\r\n1,Plain,\r\n1,"Comma, ""quoted""","two\nlines"\r\n');
});

test('loads 50 Gemeinden per batch, in order, and keeps every row', async () => {
	const rsList = Array.from({ length: 120 }, (_, i) => i + 1);
	const batches: number[][] = [];
	const text = await read(
		csvStream(
			rsList,
			async (rs) => {
				batches.push(rs);
				return rs.map((r) => ({ rs: r }));
			},
			['rs']
		)
	);
	expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
	expect(batches.flat()).toEqual(rsList);
	expect(text.split('\r\n').slice(1, -1).map(Number)).toEqual(rsList);
});

test('no rows still gives a header', async () => {
	expect(await read(csvStream([1, 2], async () => [], ['rs']))).toBe(BOM + 'rs\r\n');
});
