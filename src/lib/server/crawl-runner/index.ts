import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crawlRun } from '$lib/server/db/schema';
import { runCrawl } from '$lib/server/scraper/runCrawl';
import {
	mergeProgressTick,
	createCityStatusTracker,
	maxParallelism,
	DEFAULT_PARALLEL,
	EMPTY_PROGRESS,
	type CityStatus,
	type ProgressState,
	type ProgressTick
} from '$lib/server/scraper/client';
import { acquireTaskLock, releaseTaskLock } from '$lib/server/task-lock';

export { maxParallelism };

export interface CrawlState {
	runId: number;
	date: string;
	electionType: number;
	status: 'running' | 'done' | 'error';
	log: string[];
	error: string | null;
	/** ISO timestamp; lets the client render/tick a "running for"/"completed in" duration. */
	startedAt: string;
	progress: ProgressState;
	/** `rs -> CityStatus`, for the admin map view; see `createCityStatusTracker`. */
	cityStatus: Record<number, CityStatus>;
}

const MAX_LOG_LINES = 500;

/**
 * In-process singleton tracking the one crawl this server instance may be running, plus a tiny pub-sub
 * so `/admin/crawl/status` can stream live updates to any number of connected SSE clients. `crawl_run`
 * in Postgres is the durable record (survives restarts/tab closes) — this in-memory state is only for
 * pushing live progress while a crawl is actually running in this process.
 */
let current: CrawlState | null = null;
const subscribers = new Set<(state: CrawlState) => void>();

function notify() {
	if (!current) return;
	for (const subscriber of subscribers) subscriber(current);
}

export function getCurrentState(): CrawlState | null {
	return current;
}

export function subscribeToCrawl(callback: (state: CrawlState) => void): () => void {
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}

export function isCrawlRunning(): boolean {
	return current?.status === 'running';
}

/** Reason codes are translated client-side via paraglide messages, not localized here on the server. */
export async function startCrawl(params: {
	date: string;
	electionTypeId: number;
	/** How many cities to process concurrently; clamped to [1, maxParallelism()] regardless of input. */
	parallel?: number;
}): Promise<{ started: true } | { started: false; reason: 'already_running' }> {
	if (!acquireTaskLock()) {
		return { started: false, reason: 'already_running' };
	}

	const parallel = Math.min(
		Math.max(1, Math.floor(params.parallel ?? DEFAULT_PARALLEL)),
		maxParallelism()
	);

	// Everything from here until the background IIFE is synchronous setup — if any of it throws, the
	// lock must still be released, or every future attempt would fail with "already_running" forever
	// until the server restarts (the background task's own `finally` never gets a chance to run).
	let row: typeof crawlRun.$inferSelect;
	try {
		[row] = await db
			.insert(crawlRun)
			.values({ electionType: params.electionTypeId, date: params.date, status: 'running' })
			.returning();
	} catch (err) {
		releaseTaskLock();
		throw err;
	}

	const cityStatusTracker = createCityStatusTracker();
	current = {
		runId: row.id,
		date: params.date,
		electionType: params.electionTypeId,
		status: 'running',
		log: [],
		error: null,
		startedAt: row.startedAt.toISOString(),
		progress: EMPTY_PROGRESS,
		cityStatus: cityStatusTracker.status
	};
	notify();

	const log = (message: string, progress?: ProgressTick) => {
		if (!current) return;
		// A pure progress tick (empty message — see pollingStations.ts/results.ts's per-station ticks)
		// updates only the structured progress, skipping the log array and the DB write so a large
		// city's hundreds of stations don't flood Postgres with one UPDATE per tick.
		if (message) {
			current.log.push(message);
			if (current.log.length > MAX_LOG_LINES) current.log.shift();
			// Drizzle query builders are lazy thenables — they only actually execute once something calls
			// .then()/.catch()/is awaited. A bare `void db.update(...)` here would silently never run.
			db.update(crawlRun)
				.set({ log: current.log.join('\n'), currentStep: message })
				.where(eq(crawlRun.id, row.id))
				.catch(() => {});
		}
		if (progress) {
			current.progress = mergeProgressTick(current.progress, progress);
			cityStatusTracker.apply(progress);
		}
		notify();
	};

	// Fire-and-forget: the HTTP request that triggered this returns immediately, progress is polled via SSE.
	void (async () => {
		try {
			await runCrawl(
				db,
				{ date: params.date, electionTypeId: params.electionTypeId, parallel },
				log
			);
			cityStatusTracker.finish();
			if (current?.runId === row.id) current.status = 'done';
			await db
				.update(crawlRun)
				.set({ status: 'done', finishedAt: new Date() })
				.where(eq(crawlRun.id, row.id));
		} catch (err) {
			cityStatusTracker.finish();
			const message = err instanceof Error ? err.message : String(err);
			if (current?.runId === row.id) {
				current.status = 'error';
				current.error = message;
			}
			await db
				.update(crawlRun)
				.set({ status: 'error', error: message, finishedAt: new Date() })
				.where(eq(crawlRun.id, row.id));
		} finally {
			releaseTaskLock();
			notify();
		}
	})();

	return { started: true };
}
