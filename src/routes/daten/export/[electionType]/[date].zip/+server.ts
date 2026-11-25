import { error } from '@sveltejs/kit';
import { downloadZip } from 'client-zip';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { crawlRun } from '#lib/server/db/schema.ts';
import { getElectionTypes, getGemeindenWithData } from '#lib/server/map/queries.ts';
import { exportFiles, type ExportKind } from '#lib/server/csv-export/exportFiles.ts';
import { hasStatistikBwSource } from '#lib/server/scraper/statistikBw.ts';
import { formatDate } from '#lib/formatDate.ts';
import { formatBerlin } from '#lib/berlinTime.ts';
import * as m from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';

/**
 * GET /daten/export/<electionType>/<date>.zip: every file of the Daten-Export for every Gemeinde
 * with results, plus a sources file. A fixed URL per election, so it can be linked, cited and
 * fetched by scripts (the export page itself is a POST form with a Gemeinde selection).
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { date } = params;
	if (!/^\d+$/.test(params.electionType) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) error(404);
	const electionType = Number(params.electionType);

	const [rsList, types, [lastRun]] = await Promise.all([
		getGemeindenWithData(db, electionType, date),
		getElectionTypes(db),
		db
			.select({ finishedAt: crawlRun.finishedAt })
			.from(crawlRun)
			.where(
				and(
					eq(crawlRun.electionType, electionType),
					eq(crawlRun.date, date),
					eq(crawlRun.status, 'done')
				)
			)
			.orderBy(desc(crawlRun.finishedAt))
			.limit(1)
	]);
	if (rsList.length === 0) error(404, m.export_no_results());

	const description =
		types.find((t) => t.electionType === electionType)?.electionDescription ??
		`Wahl ${electionType}`;
	// Same rule as the export page's "pro Kandidat:in" toggle.
	const kinds: ExportKind[] = /Gemeinde|Kreis/.test(description)
		? ['meta', 'aggregate', 'psByParty', 'psByCandidate', 'metaPs']
		: ['meta', 'aggregate', 'psByParty', 'metaPs'];

	const source = hasStatistikBwSource(date, electionType)
		? `Statistisches Landesamt Baden-Württemberg (https://wahlen.statistik-bw.de/ltw26/): ${m.about_src_statistik_ltw()}`
		: `Komm.ONE – votemanager (https://wahlergebnisse.komm.one): ${m.about_src_kommone()}`;
	const sources = [
		m.export_sources_title({ election: description, date: formatDate(date) }),
		m.export_sources_scope({
			n: String(rsList.length),
			created: formatBerlin(new Date()),
			url: url.origin
		}),
		lastRun?.finishedAt
			? m.export_sources_status({ date: formatBerlin(lastRun.finishedAt) })
			: m.export_sources_status_unknown(),
		'',
		`${m.export_sources_heading()}:`,
		`- ${source}`,
		'',
		m.export_sources_format({ url: `${url.origin}/datenformat` }),
		m.export_sources_reuse(),
		m.about_disclaimer(),
		''
	].join('\n');

	const slug = description
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-');
	const zip = downloadZip([
		{ name: m.export_sources_filename(), input: sources },
		...exportFiles(kinds, rsList, electionType, date)
	]);
	zip.headers.set('Content-Disposition', `attachment; filename="${slug}-${date}.zip"`);
	// Results only change with a crawl; short enough for election night.
	zip.headers.set('Cache-Control', 'public, max-age=300');
	return zip;
};
