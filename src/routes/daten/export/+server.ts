import { error } from '@sveltejs/kit';
import { downloadZip } from 'client-zip';
import { exportFiles, type ExportKind } from '#lib/server/csv-export/exportFiles.ts';
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

	const kinds: ExportKind[] = [];
	if (wantMeta) kinds.push('meta');
	if (wantAggregate) kinds.push('aggregate');
	if (wantPs) kinds.push(person ? 'psByCandidate' : 'psByParty');
	if (wantMetaPs) kinds.push('metaPs');
	const files = exportFiles(kinds, rsList, electionType, date);

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
