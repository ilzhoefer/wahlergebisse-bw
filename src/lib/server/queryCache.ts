/**
 * In-memory memo for the map's read queries. Election results only change when a crawl writes new
 * data, yet every hover/click/Stimme switch re-ran the same queries — so results are kept until the
 * next crawl finishes (see crawl-runner, which calls `clearQueryCache`).
 *
 * Stores the promise itself, so concurrent identical requests share one DB round trip; a rejected
 * promise is dropped so a transient DB error isn't cached.
 */
// ponytail: FIFO eviction at a fixed entry cap, per-process; swap for a real LRU / shared cache if
// memory or multi-instance deployments ever matter.
const MAX_ENTRIES = 1000;
const cache = new Map<string, Promise<unknown>>();

export function memo<T>(name: string, args: unknown, load: () => Promise<T>): Promise<T> {
	const key = `${name}:${JSON.stringify(args)}`;
	const hit = cache.get(key);
	if (hit) return hit as Promise<T>;
	const promise = load();
	cache.set(key, promise);
	promise.catch(() => cache.delete(key));
	if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
	return promise;
}

export function clearQueryCache() {
	cache.clear();
}
