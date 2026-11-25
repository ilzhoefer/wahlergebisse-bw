import { db } from '#lib/server/db/index.ts';
import { csvStream } from '#lib/server/csv-export/csv.ts';
import { EXPORT_FILES } from '#lib/csv-export/files.ts';
import {
	getMetaRows,
	getAggregateRows,
	getStationMetaRows,
	getStationResultsByCandidate,
	getStationResultsByParty
} from '#lib/server/csv-export/queries.ts';

export type ExportKind = keyof typeof EXPORT_FILES;

const QUERIES: Record<
	ExportKind,
	(d: typeof db, rs: number[], type: number, date: string) => Promise<Record<string, unknown>[]>
> = {
	meta: getMetaRows,
	aggregate: getAggregateRows,
	psByCandidate: getStationResultsByCandidate,
	psByParty: getStationResultsByParty,
	metaPs: getStationMetaRows
};

/** The CSV files of one election as `{ name, input }` for client-zip, each streamed in batches of
 * Gemeinden (see csvStream); order follows `kinds`. */
export function exportFiles(
	kinds: ExportKind[],
	rsList: number[],
	electionType: number,
	date: string
) {
	const sorted = [...new Set(rsList)].sort((a, b) => a - b);
	return kinds.map((kind) => ({
		name: EXPORT_FILES[kind].name,
		input: csvStream(
			sorted,
			(rs) => QUERIES[kind](db, rs, electionType, date),
			EXPORT_FILES[kind].columns
		)
	}));
}
