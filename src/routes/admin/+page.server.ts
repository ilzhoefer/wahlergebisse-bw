import { desc, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crawlRun, electionResult, electionType, elections } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const [lastRun] = await db.select().from(crawlRun).orderBy(desc(crawlRun.id)).limit(1);
	const electionTypes = await db.select().from(electionType).orderBy(electionType.electionType);
	// One row per (date, electionType) already discovered/classified by a previous crawl or a
	// "Termine aktualisieren" run — used to populate the date dropdown and, per selected Wahlart, filter
	// it down to dates that type actually happened on. `gemeinden` counts the Gemeinden holding that
	// election, `withData` those of them that already have results in `election_result` (shown in the
	// dropdown so incomplete crawls stand out). ~0.6s on the full dataset — fine for an admin page.
	const dateTypeRows = await db
		.select({
			date: elections.date,
			electionType: elections.electionType,
			gemeinden: sql<number>`count(distinct ${elections.rs})::int`,
			withData: sql<number>`(count(distinct ${elections.rs}) filter (where exists (
				select 1 from ${electionResult}
				where ${electionResult.electionId} = ${elections.electionId}
					and ${electionResult.rs} = ${elections.rs}
			)))::int`
		})
		.from(elections)
		.groupBy(elections.date, elections.electionType)
		.orderBy(desc(elections.date));

	const datesToTypes: Record<string, number[]> = {};
	const knownDates: string[] = [];
	// Keyed `${date}|${electionType}`.
	const gemeindeCounts: Record<string, { gemeinden: number; withData: number }> = {};
	for (const row of dateTypeRows) {
		if (row.date === null) continue;
		if (!(row.date in datesToTypes)) {
			datesToTypes[row.date] = [];
			knownDates.push(row.date);
		}
		if (row.electionType === null) continue;
		datesToTypes[row.date].push(row.electionType);
		gemeindeCounts[`${row.date}|${row.electionType}`] = {
			gemeinden: row.gemeinden,
			withData: row.withData
		};
	}

	return {
		lastRun: lastRun ?? null,
		electionTypes,
		knownDates,
		datesToTypes,
		gemeindeCounts
	};
};
