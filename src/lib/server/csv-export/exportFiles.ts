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

/** An export holds several large queries open while it streams; a handful at once is plenty for one
 * server, and more would starve the map's queries on the same database pool. */
// ponytail: per-process counter (single instance, see CLAUDE.md); a shared limiter if that changes.
const MAX_ACTIVE_EXPORTS = 3;
let activeExports = 0;

/**
 * Runs `start` if an export slot is free and keeps the slot until its response body has been fully
 * sent, failed or been cancelled by the client. Returns null when all slots are taken.
 */
export function withExportSlot(start: () => Response): Response | null {
	if (activeExports >= MAX_ACTIVE_EXPORTS) return null;
	activeExports++;
	let released = false;
	const release = () => {
		if (!released) activeExports--;
		released = true;
	};
	let response: Response;
	try {
		response = start();
	} catch (err) {
		release();
		throw err;
	}
	if (!response.body) {
		release();
		return response;
	}
	const reader = response.body.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					release();
					controller.close();
				} else controller.enqueue(value);
			} catch (err) {
				release();
				controller.error(err);
			}
		},
		cancel(reason) {
			release();
			return reader.cancel(reason);
		}
	});
	return new Response(body, { status: response.status, headers: response.headers });
}
