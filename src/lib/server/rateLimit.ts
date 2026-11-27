/**
 * Per-client rate limits for the public endpoints that cost database time (hooks.server.ts).
 * Token buckets: each client may burst up to `capacity` requests, refilled at `perSecond`.
 */
// ponytail: in-memory and per process (the app assumes one instance, see CLAUDE.md); a shared store
// such as Redis if it ever runs as several instances.

export interface Limiter {
	/** 0 if the request may proceed, else the seconds until the client may try again. */
	take(key: string, now?: number): number;
	readonly size: number;
}

/** Above this many tracked clients, idle ones (bucket full again) are dropped. */
const MAX_TRACKED = 20_000;

export function createLimiter(capacity: number, perSecond: number): Limiter {
	const buckets = new Map<string, { tokens: number; at: number }>();
	const refill = (b: { tokens: number; at: number }, now: number) => {
		b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * perSecond);
		b.at = now;
	};
	return {
		take(key, now = Date.now()) {
			let b = buckets.get(key);
			if (!b) {
				if (buckets.size >= MAX_TRACKED) {
					for (const [k, other] of buckets) {
						refill(other, now);
						if (other.tokens >= capacity) buckets.delete(k);
					}
				}
				b = { tokens: capacity, at: now };
				buckets.set(key, b);
			}
			refill(b, now);
			if (b.tokens >= 1) {
				b.tokens -= 1;
				return 0;
			}
			return Math.ceil((1 - b.tokens) / perSecond);
		},
		get size() {
			return buckets.size;
		}
	};
}

/**
 * Loopback, private and link-local addresses. Behind a reverse proxy without adapter-node's
 * ADDRESS_HEADER every request comes from such an address (the proxy's), so limiting by it would
 * throttle all visitors together; those requests are left unlimited instead.
 */
export function isPrivateAddress(ip: string): boolean {
	const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(v4);
	if (m) {
		const [a, b] = [Number(m[1]), Number(m[2])];
		return (
			a === 10 ||
			a === 127 ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 169 && b === 254) ||
			(a === 100 && b >= 64 && b <= 127) // carrier-grade NAT / Docker-style overlay ranges
		);
	}
	const v6 = ip.toLowerCase();
	return v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}
