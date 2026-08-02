/** Minimal RFC 4180 CSV serializer — quotes a field only when it contains a comma, quote, or newline. */
function escapeCsvField(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
	return str;
}

/** Serializes an array of flat objects to CSV text (with a UTF-8 BOM so Excel opens umlauts correctly). */
export function toCsv<T extends Record<string, unknown>>(
	rows: T[],
	columns: (keyof T & string)[]
): string {
	const header = columns.join(',');
	const body = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','));
	return '﻿' + [header, ...body].join('\r\n') + '\r\n';
}
