const BASE = 'https://wahlergebnisse.komm.one/lb/produktion';

export type Logger = (message: string) => void;

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

export const fallbackOnContentNull = <T>(r: FetchResult<T>) => r.content === null;
export const fallbackOnNotOk = <T>(r: FetchResult<T>) => r.status !== 200;
export const fallbackOnNotFound = <T>(r: FetchResult<T>) => r.status === 404;

export { BASE };
export type { FetchResult };
