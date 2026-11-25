import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crawlRun } from '$lib/server/db/schema';
import { getElectionTypes, getAllElectionDates } from '$lib/server/map/queries';
import { getQualityReport } from '$lib/server/quality';
import type { PageServerLoad } from './$types';

/** Access is enforced in hooks.server.ts. `?wahl=&datum=` (links) or `?e=wahl|datum` (the
 * page's picker form) selects the election; default is the last finished crawl, else the newest. */
export const load: PageServerLoad = async ({ url }) => {
	const [types, dates, [lastDone]] = await Promise.all([
		getElectionTypes(db),
		getAllElectionDates(db),
		db
			.select({ electionType: crawlRun.electionType, date: crawlRun.date })
			.from(crawlRun)
			.where(eq(crawlRun.status, 'done'))
			.orderBy(desc(crawlRun.id))
			.limit(1)
	]);
	const description = new Map(types.map((t) => [t.electionType, t.electionDescription]));
	const elections = dates
		.filter((d): d is { electionType: number; date: string } => !!d.electionType && !!d.date)
		.sort((a, b) => b.date.localeCompare(a.date) || a.electionType - b.electionType)
		.map((d) => ({ ...d, label: description.get(d.electionType) ?? String(d.electionType) }));

	const [e0, e1] = (url.searchParams.get('e') ?? '').split('|');
	const wahl = Number(url.searchParams.get('wahl') ?? e0);
	const datum = url.searchParams.get('datum') ?? e1;
	const selected =
		elections.find((e) => e.electionType === wahl && e.date === datum) ??
		elections.find((e) => e.electionType === lastDone?.electionType && e.date === lastDone?.date) ??
		elections[0] ??
		null;

	return {
		elections,
		selected,
		report: selected ? await getQualityReport(db, selected.electionType, selected.date) : null
	};
};
