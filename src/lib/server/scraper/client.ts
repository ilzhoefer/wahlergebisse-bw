const BASE = 'https://wahlergebnisse.komm.one/lb/produktion';

/**
 * A tick reports "index/total" progress at one nesting level of a crawl (the 8 sequential steps in
 * `runCrawl.ts`, the municipality being processed within a step, or the polling station within a
 * municipality). Emitted alongside — not instead of — the plain text log line.
 */
export interface ProgressTick {
	level: 'step' | 'city' | 'station';
	index: number;
	total: number;
	label: string;
}

/**
 * `message` is the human-readable log line (unchanged from before). `progress`, when present, updates
 * the structured progress display; most call sites never pass it and behave exactly as before.
 */
export type Logger = (message: string, progress?: ProgressTick) => void;

export interface ProgressState {
	step?: ProgressTick;
	city?: ProgressTick;
	station?: ProgressTick;
}

const PROGRESS_LEVELS: ProgressTick['level'][] = ['step', 'city', 'station'];

/**
 * A tick at a shallower level (e.g. a new step starting) invalidates any more-granular level's
 * progress from the previous step/city — otherwise a leftover "Wahlbezirk 480/500" bar would linger
 * on screen after the crawl has moved on to a step that has no polling-station loop at all.
 */
export function mergeProgressTick(progress: ProgressState, tick: ProgressTick): ProgressState {
	const next: ProgressState = { ...progress, [tick.level]: tick };
	const levelIndex = PROGRESS_LEVELS.indexOf(tick.level);
	for (const deeper of PROGRESS_LEVELS.slice(levelIndex + 1)) delete next[deeper];
	return next;
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
