import { error } from '@sveltejs/kit';
import { downloadZip } from 'client-zip';
import { db } from '$lib/server/db';
import { csvStream } from '$lib/server/csv-export/csv';
import { EXPORT_FILES } from '$lib/csv-export/files';
import {
	getMetaRows,
	getAggregateRows,
	getStationMetaRows,
	getStationResultsByCandidate,
	getStationResultsByParty
} from '$lib/server/csv-export/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();

	const rsList = form.getAll('rs').map(Number).filter(Number.isFinite);
	const electionType = Number(form.get('electionType'));
	const date = form.get('date')?.toString();
	if (rsList.length === 0) error(400, 'Mindestens eine Gemeinde muss ausgewählt werden');
	if (!Number.isFinite(electionType) || !date) error(400, 'Wahl muss ausgewählt werden');

	const wantMeta = form.get('meta') === 'on';
	const wantAggregate = form.get('aggregate') === 'on';
	const wantPs = form.get('ps') === 'on';
	const wantMetaPs = form.get('metaPs') === 'on';
	const person = form.get('person') === 'on';

	if (!wantMeta && !wantAggregate && !wantPs && !wantMetaPs) {
		error(400, 'Mindestens eine Datenart muss ausgewählt werden');
	}

	// Each file is streamed in batches of Gemeinden (see csvStream); order in the ZIP follows this list.
	const sorted = [...new Set(rsList)].sort((a, b) => a - b);
	const file = <T extends Record<string, unknown>>(
		spec: { name: string; columns: readonly (keyof T & string)[] },
		query: (d: typeof db, rs: number[], type: number, date: string) => Promise<T[]>
	) => ({
		name: spec.name,
		input: csvStream(sorted, (rs) => query(db, rs, electionType, date), spec.columns)
	});
	const files = [
		wantMeta && file(EXPORT_FILES.meta, getMetaRows),
		wantAggregate && file(EXPORT_FILES.aggregate, getAggregateRows),
		wantPs &&
			(person
				? file(EXPORT_FILES.psByCandidate, getStationResultsByCandidate)
				: file(EXPORT_FILES.psByParty, getStationResultsByParty)),
		wantMetaPs && file(EXPORT_FILES.metaPs, getStationMetaRows)
	].filter((f) => f !== false);

	if (files.length === 1) {
		return new Response(files[0].input, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${files[0].name}"`
			}
		});
	}

	const zipResponse = downloadZip(files);
	zipResponse.headers.set('Content-Disposition', 'attachment; filename="wahlergebnisse.zip"');
	return zipResponse;
};
