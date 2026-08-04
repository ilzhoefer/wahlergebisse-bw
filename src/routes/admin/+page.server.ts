import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crawlRun, electionType, elections } from '$lib/server/db/schema';
import { maxParallelism } from '$lib/server/crawl-runner';

export const load: PageServerLoad = async () => {
	const [lastRun] = await db.select().from(crawlRun).orderBy(desc(crawlRun.id)).limit(1);
	const electionTypes = await db.select().from(electionType).orderBy(electionType.electionType);
	// One row per (date, electionType) already discovered/classified by a previous crawl or a
	// "Termine aktualisieren" run — used to populate the date dropdown and, per selected date, filter
	// the Wahlart dropdown down to types that actually exist on that day. No live API calls needed for
	// either — both are instant lookups against data already in `elections`.
	const dateTypeRows = await db
		.selectDistinct({ date: elections.date, electionType: elections.electionType })
		.from(elections)
		.orderBy(desc(elections.date));

	const datesToTypes: Record<string, number[]> = {};
	const knownDates: string[] = [];
	for (const row of dateTypeRows) {
		if (row.date === null) continue;
		if (!(row.date in datesToTypes)) {
			datesToTypes[row.date] = [];
			knownDates.push(row.date);
		}
		if (row.electionType !== null) datesToTypes[row.date].push(row.electionType);
	}

	return {
		lastRun: lastRun ?? null,
		electionTypes,
		knownDates,
		datesToTypes,
		maxParallel: maxParallelism()
	};
};
