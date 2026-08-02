import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { cities, elections } from '$lib/server/db/schema';
import { updateElectionDates, setElectionType } from '$lib/server/scraper/elections';
import { acquireTaskLock, releaseTaskLock } from '$lib/server/task-lock';

export interface DateDiscoveryState {
	status: 'running' | 'done' | 'error';
	log: string[];
	dates: string[];
	error: string | null;
}

const MAX_LOG_LINES = 500;

/**
 * Same in-process singleton + pub-sub shape as `crawl-runner`, but for the admin UI's "Termine
 * aktualisieren" button. This runs the same discovery + classification steps a real crawl's first two
 * steps do (`updateElectionDates` with no date filter, then `setElectionType`), persisting everything
 * into `elections`/`elections_votetypes` — so the admin date/Wahlart dropdowns can filter instantly off
 * that table afterwards, with no further live API calls needed on every date selection.
 */
let current: DateDiscoveryState | null = null;
const subscribers = new Set<(state: DateDiscoveryState) => void>();

function notify() {
	if (!current) return;
	for (const subscriber of subscribers) subscriber(current);
}

export function getCurrentState(): DateDiscoveryState | null {
	return current;
}

export function subscribeToDateDiscovery(
	callback: (state: DateDiscoveryState) => void
): () => void {
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}

export async function startDateDiscovery(): Promise<
	{ started: true } | { started: false; reason: 'already_running' }
> {
	if (!acquireTaskLock()) {
		return { started: false, reason: 'already_running' };
	}

	current = { status: 'running', log: [], dates: [], error: null };
	notify();

	const log = (message: string) => {
		if (!current) return;
		current.log.push(message);
		if (current.log.length > MAX_LOG_LINES) current.log.shift();
		notify();
	};

	void (async () => {
		try {
			const cityList = (await db.select().from(cities)).flatMap((c) =>
				c.ags === null ? [] : [{ rs: c.rs, ags: c.ags, name: c.name }]
			);
			await updateElectionDates(db, cityList, log);
			await setElectionType(db, log);

			const rows = await db
				.selectDistinct({ date: elections.date })
				.from(elections)
				.orderBy(desc(elections.date));
			if (current) {
				current.status = 'done';
				current.dates = rows.map((r) => r.date).filter((d): d is string => d !== null);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (current) {
				current.status = 'error';
				current.error = message;
			}
		} finally {
			releaseTaskLock();
			notify();
		}
	})();

	return { started: true };
}
