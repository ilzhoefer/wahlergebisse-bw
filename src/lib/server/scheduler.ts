/**
 * Election-night crawls without anyone clicking: once a minute, if the schedule (crawl_schedule) is
 * active and inside its time window, start the crawl again `intervalMinutes` after the last run for
 * that election ended. Started from hooks.server.ts's init.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { crawlRun, crawlSchedule } from '#lib/server/db/schema.ts';
import { startCrawl } from '#lib/server/crawl-runner/index.ts';
import { isAnyTaskRunning } from '#lib/server/task-lock.ts';

const TICK_MS = 60_000;
/** A 'running' row older than this belongs to a dead process — don't let it block the schedule. */
const STALE_RUN_MS = 6 * 60 * 60 * 1000;

export async function getSchedule() {
	const [row] = await db.select().from(crawlSchedule).where(eq(crawlSchedule.id, 1));
	return row ?? null;
}

/** When the scheduled crawl is due next (possibly in the past = now), or null if none is. */
export async function nextScheduledRun(now = new Date()): Promise<Date | null> {
	const s = await getSchedule();
	if (!s?.active || now > s.endsAt) return null;
	const [last] = await db
		.select({
			status: crawlRun.status,
			startedAt: crawlRun.startedAt,
			finishedAt: crawlRun.finishedAt
		})
		.from(crawlRun)
		.where(and(eq(crawlRun.electionType, s.electionType), eq(crawlRun.date, s.date)))
		.orderBy(desc(crawlRun.id))
		.limit(1);
	// ponytail: the DB 'running' check is only a guard against a second server process; two
	// processes ticking in the same second could both start. Use a Postgres advisory lock if this ever
	// runs as more than one instance.
	if (last?.status === 'running' && now.getTime() - last.startedAt.getTime() < STALE_RUN_MS)
		return null;
	const due = last?.finishedAt
		? new Date(last.finishedAt.getTime() + s.intervalMinutes * 60_000)
		: s.startsAt;
	return due < s.startsAt ? s.startsAt : due > s.endsAt ? null : due;
}

async function tick() {
	if (isAnyTaskRunning()) return;
	const due = await nextScheduledRun();
	if (!due || due > new Date()) return;
	const s = (await getSchedule())!;
	await startCrawl({ date: s.date, electionTypeId: s.electionType });
}

const started = Symbol.for('wahlergebnisse.scheduler');
export function startScheduler() {
	const g = globalThis as Record<symbol, boolean>;
	if (g[started]) return;
	g[started] = true;
	setInterval(() => tick().catch((err) => console.error('scheduled crawl failed:', err)), TICK_MS);
}
