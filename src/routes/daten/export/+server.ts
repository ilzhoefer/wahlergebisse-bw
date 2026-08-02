import { error } from '@sveltejs/kit';
import { downloadZip } from 'client-zip';
import { db } from '$lib/server/db';
import { toCsv } from '$lib/server/csv-export/csv';
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

	const files: { name: string; csv: string }[] = [];

	if (wantMeta) {
		const rows = await getMetaRows(db, rsList, electionType, date);
		files.push({
			name: 'wahlbeteiligung.csv',
			csv: toCsv(rows, [
				'rs',
				'cityName',
				'votetypeId',
				'votesEligible',
				'voters',
				'invalidBallots',
				'validBallots',
				'votesCast',
				'turnout'
			])
		});
	}

	if (wantAggregate) {
		const rows = await getAggregateRows(db, rsList, electionType, date);
		files.push({
			name: 'parteiergebnisse_pro_gemeinde.csv',
			csv: toCsv(rows, [
				'rs',
				'cityName',
				'partyNameShort',
				'partyNameLong',
				'votetypeId',
				'voteCount',
				'votePercent'
			])
		});
	}

	if (wantPs) {
		if (person) {
			const rows = await getStationResultsByCandidate(db, rsList, electionType, date);
			files.push({
				name: 'ergebnisse_pro_wahlbezirk_kandidaten.csv',
				csv: toCsv(rows, [
					'rs',
					'cityName',
					'psId',
					'stationName',
					'votetypeId',
					'partyName',
					'candidateName',
					'voteCount',
					'votePercent'
				])
			});
		} else {
			const rows = await getStationResultsByParty(db, rsList, electionType, date);
			files.push({
				name: 'ergebnisse_pro_wahlbezirk_parteien.csv',
				csv: toCsv(rows, [
					'rs',
					'cityName',
					'psId',
					'stationName',
					'votetypeId',
					'partyNameShort',
					'partyNameLong',
					'voteCount'
				])
			});
		}
	}

	if (wantMetaPs) {
		const rows = await getStationMetaRows(db, rsList, electionType, date);
		files.push({
			name: 'wahlbezirke_metadaten.csv',
			csv: toCsv(rows, ['rs', 'cityName', 'psId', 'name', 'address', 'description', 'isPostal'])
		});
	}

	if (files.length === 1) {
		return new Response(files[0].csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${files[0].name}"`
			}
		});
	}

	const zipResponse = downloadZip(files.map((f) => ({ name: f.name, input: f.csv })));
	zipResponse.headers.set('Content-Disposition', 'attachment; filename="wahlergebnisse.zip"');
	return zipResponse;
};
