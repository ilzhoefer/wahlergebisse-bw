import { json, error } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crawlRun } from '$lib/server/db/schema';
import { getCurrentState } from '$lib/server/crawl-runner';
import { getSchedule } from '$lib/server/scheduler';
import type { RequestHandler } from './$types';

export interface LiveStatus {
	/** A crawl for this election is running, or the election-night schedule covers now. */
	live: boolean;
	/** When the last finished crawl of this election ended (ISO) — the data's "Stand". */
	updatedAt: string | null;
	gemeinden: number;
	total: number;
}

/** Public election-night status for one election; the map polls it while `live`. */
export const GET: RequestHandler = async ({ url }) => {
	const type = Number(url.searchParams.get('wahl'));
	const date = url.searchParams.get('datum') ?? '';
	if (!Number.isInteger(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400);

	const now = new Date();
	const current = getCurrentState();
	const [schedule, [last], [counts]] = await Promise.all([
		getSchedule(),
		db
			.select({ finishedAt: crawlRun.finishedAt })
			.from(crawlRun)
			.where(
				and(eq(crawlRun.electionType, type), eq(crawlRun.date, date), eq(crawlRun.status, 'done'))
			)
			.orderBy(desc(crawlRun.finishedAt))
			.limit(1),
		db.execute(sql`
			SELECT
				(SELECT count(DISTINCT rs)::int FROM election_result_aggregate_meta_region
					WHERE election_type = ${type} AND date = ${date} AND rs IN (SELECT rs FROM cities)) AS gemeinden,
				(SELECT count(DISTINCT rs)::int FROM elections WHERE election_type = ${type} AND date = ${date}) AS total
		`) as unknown as Promise<{ gemeinden: number; total: number }[]>
	]);
	const running =
		current?.status === 'running' && current.electionType === type && current.date === date;
	const scheduled =
		!!schedule?.active &&
		schedule.electionType === type &&
		schedule.date === date &&
		now >= schedule.startsAt &&
		now <= schedule.endsAt;

	const body: LiveStatus = {
		live: running || scheduled,
		updatedAt: last?.finishedAt?.toISOString() ?? null,
		gemeinden: counts?.gemeinden ?? 0,
		total: counts?.total ?? 0
	};
	return json(body, { headers: { 'Cache-Control': 'public, max-age=30' } });
};
