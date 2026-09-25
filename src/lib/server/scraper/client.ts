import { cpus } from 'node:os';

const BASE = 'https://wahlergebnisse.komm.one/lb/produktion';

/**
 * The crawl is network-bound (waiting on komm.one HTTP responses), not CPU-bound, so extra OS
 * threads/cores wouldn't by themselves speed anything up — what helps is having more requests in
 * flight at once. Core count is still a reasonable, legible cap for the "how many cities at once"
 * control so a crawl can't be configured to hammer this machine (or the upstream API) unboundedly.
 */
export function maxParallelism(): number {
	return Math.max(1, cpus().length - 1);
}

export const DEFAULT_PARALLEL = 1;

/**
 * Runs `worker` over `items` with at most `concurrency` calls in flight at once — a fixed pool of
 * "workers" each pull the next item off a shared cursor as soon as they finish the previous one, so
 * faster items don't sit blocked behind slower ones from earlier in the array. `worker` receives its
 * 0-based `slot` — stable for that worker's entire lifetime, regardless of which items it processes —
 * so callers can report per-worker progress that stays in the same position instead of jumping around
 * as different items happen to be in flight. `onSlotIdle` fires once a slot's worker has pulled the last
 * item off the queue and has nothing left to do, so callers can clean up that slot's UI state.
 */
export async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T, slot: number) => Promise<void>,
	onSlotIdle?: (slot: number) => void
): Promise<void> {
	const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
	let cursor = 0;
	async function runWorker(slot: number) {
		while (cursor < items.length) {
			const item = items[cursor++];
			await worker(item, slot);
		}
		onSlotIdle?.(slot);
	}
	await Promise.all(Array.from({ length: limit }, (_, slot) => runWorker(slot)));
}

/** A municipality's outcome within the step currently looping over it. */
export type CityStatus = 'in_progress' | 'done' | 'skipped';

/**
 * A tick reports "index/total" progress at one nesting level of a crawl (the 8 sequential steps in
 * `runCrawl.ts`, the municipality being processed within a step, or the polling station within a
 * municipality). Emitted alongside — not instead of — the plain text log line.
 *
 * `rs` is set on every `level: 'city'` tick, for the `CityStatusTracker`'s per-municipality map below.
 * `slot` is set on every `level: 'station'` tick instead — the concurrency worker (see
 * `runWithConcurrency`) that produced it, stable for as long as that worker keeps picking up cities, so
 * a station bar's position never moves even as the city behind it changes. `closed` marks a station
 * tick whose worker has run out of cities for good (`onSlotIdle`) — its bar should disappear rather than
 * keep showing whichever city it last processed. `cityStatus` is only ever set on `level: 'city'` ticks.
 */
export interface ProgressTick {
	level: 'step' | 'city' | 'station' | 'family';
	index: number;
	total: number;
	label: string;
	rs?: number;
	cityStatus?: CityStatus;
	slot?: number;
	closed?: boolean;
}

/**
 * `message` is the human-readable log line (unchanged from before). `progress`, when present, updates
 * the structured progress display; most call sites never pass it and behave exactly as before.
 */
export type Logger = (message: string, progress?: ProgressTick) => void;

export interface ProgressState {
	step?: ProgressTick;
	city?: ProgressTick;
	/** Keyed by concurrency slot (0-based) — one entry per worker currently doing station-level work,
	 * always in the same slot regardless of which city that worker is currently on. */
	stations: Record<number, ProgressTick>;
	family?: ProgressTick;
}

export const EMPTY_PROGRESS: ProgressState = { stations: {} };

/**
 * A tick at a shallower level (e.g. a new step starting) invalidates deeper levels' progress from the
 * previous step — otherwise a leftover "Wahlbezirk 480/500" bar would linger after the crawl moves on
 * to a step with no polling-station loop at all. Station ticks are keyed by `slot` instead of replacing
 * a single field: a worker's tick just overwrites its own slot's previous entry (a new city starting in
 * that slot naturally replaces the last one shown), and a `closed` tick removes that slot entirely once
 * its worker has nothing left to do.
 */
export function mergeProgressTick(progress: ProgressState, tick: ProgressTick): ProgressState {
	if (tick.level === 'station') {
		if (tick.slot === undefined) return progress;
		const stations = { ...progress.stations };
		if (tick.closed) {
			delete stations[tick.slot];
		} else {
			stations[tick.slot] = tick;
		}
		return { ...progress, stations };
	}

	const next: ProgressState = { ...progress, [tick.level]: tick };
	if (tick.level === 'step') {
		next.city = undefined;
		next.stations = {};
		next.family = undefined;
	}
	return next;
}

/**
 * Turns the stream of city-level ticks into a running `rs -> CityStatus` map for the admin map view.
 * Every step function explicitly emits a `cityStatus: 'done'` tick once a city's work actually
 * finishes — required now that cities can be processed several at a time (`runWithConcurrency`), so
 * "the next city starting" no longer reliably means "the previous one is done" (several may be
 * in-flight simultaneously). Shared between `crawl-runner` and `date-discovery`.
 */
export function createCityStatusTracker() {
	const status: Record<number, CityStatus> = {};
	const activeRs = new Set<number>();

	function apply(tick: ProgressTick) {
		if (tick.level === 'step') {
			// Each step re-loops over the full municipality list from scratch, so a status left over from
			// the previous step (e.g. every city still green from "Wahlbezirke abrufen") would otherwise
			// look like this step already processed them too. Clear the board on every step change.
			for (const rs of Object.keys(status)) delete status[Number(rs)];
			activeRs.clear();
			return;
		}
		if (tick.level !== 'city' || tick.rs === undefined) return;
		const cityStatus = tick.cityStatus ?? 'in_progress';
		status[tick.rs] = cityStatus;
		if (cityStatus === 'in_progress') activeRs.add(tick.rs);
		else activeRs.delete(tick.rs);
	}

	// Call once the crawl itself has finished (successfully or not) — a city whose worker was cut off
	// mid-flight (e.g. an uncaught error) never gets its own 'done' tick, so flip any stragglers here.
	function finish() {
		for (const rs of activeRs) status[rs] = 'done';
		activeRs.clear();
	}

	return { status, apply, finish };
}

/** Zero-pads an `ags` (Amtlicher Gemeindeschlüssel) to 8 digits, matching the R scraper's `%08d`. */
export function padAgs(ags: number): string {
	return String(ags).padStart(8, '0');
}

/** `YYYYMMDD`, matching `format(date, "%Y%m%d")` in the R scraper. */
export function formatDateForUrl(isoDate: string): string {
	return isoDate.replaceAll('-', '');
}

interface FetchResult<T> {
	status: number;
	content: T | null;
}

async function fetchJson<T>(url: string): Promise<FetchResult<T>> {
	try {
		const res = await fetch(url);
		let content: T | null = null;
		try {
			content = (await res.json()) as T;
		} catch {
			content = null;
		}
		return { status: res.status, content };
	} catch {
		// Network error — treated the same as an unavailable response so callers' fallback logic applies.
		return { status: 0, content: null };
	}
}

/**
 * Every scraper endpoint has a "daten/api" primary URL and an "api/praesentation" fallback — but
 * *when* to fall back differs per endpoint in the original R code (some only on exactly HTTP 404,
 * some whenever the response isn't 200, some whenever the parsed content is null regardless of
 * status). `shouldFallback` lets each call site preserve its own original trigger condition instead
 * of forcing one rule on all of them.
 */
export async function fetchWithFallback<T>(
	primaryUrl: string,
	fallbackUrl: string,
	shouldFallback: (result: FetchResult<T>) => boolean
): Promise<FetchResult<T>> {
	const primary = await fetchJson<T>(primaryUrl);
	if (!shouldFallback(primary)) return primary;
	return fetchJson<T>(fallbackUrl);
}

/** Caps a loop to ~50 progress ticks regardless of size, so a 500-station city doesn't flood the SSE stream. */
export function progressEvery(total: number): number {
	return Math.max(1, Math.floor(total / 50));
}

export const fallbackOnContentNull = <T>(r: FetchResult<T>) => r.content === null;
export const fallbackOnNotOk = <T>(r: FetchResult<T>) => r.status !== 200;
export const fallbackOnNotFound = <T>(r: FetchResult<T>) => r.status === 404;

export { BASE };
export type { FetchResult };
