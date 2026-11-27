/** Minimal RFC 4180 CSV serializer — quotes a field only when it contains a comma, quote, or newline. */
function escapeCsvField(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
	return str;
}

/** Gemeinden per query: an export of every Gemeinde's station results never sits in memory at once. */
const BATCH = 50;
const encoder = new TextEncoder();

/**
 * Streams a CSV (with a UTF-8 BOM so Excel opens umlauts correctly), querying `load` for a batch of
 * Gemeinden at a time — peak memory is one batch, not the whole export.
 */
export function csvStream<T extends Record<string, unknown>>(
	rsList: number[],
	load: (rs: number[]) => Promise<T[]>,
	columns: readonly (keyof T & string)[]
): ReadableStream<Uint8Array> {
	let i = 0;
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('\uFEFF' + columns.join(',') + '\r\n'));
		},
		async pull(controller) {
			// A pull that enqueues nothing is never followed by another one, so a batch of Gemeinden
			// without rows used to stall the download for good: keep loading until there is data.
			while (i < rsList.length) {
				const rows = await load(rsList.slice(i, (i += BATCH)));
				if (rows.length === 0) continue;
				controller.enqueue(
					encoder.encode(
						rows
							.map((row) => columns.map((col) => escapeCsvField(row[col])).join(',') + '\r\n')
							.join('')
					)
				);
				return;
			}
			controller.close();
		}
	});
}
