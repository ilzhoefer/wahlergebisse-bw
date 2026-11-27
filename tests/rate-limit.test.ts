/**
 * Token-bucket limiter and the private-address check (src/lib/server/rateLimit.ts).
 * Run with: bun run test
 */
import { expect, test } from 'bun:test';
import { createLimiter, isPrivateAddress } from '../src/lib/server/rateLimit';

test('allows a burst, then refills at the given rate', () => {
	const limiter = createLimiter(3, 1);
	const t = 1_000_000;
	expect([1, 2, 3].map(() => limiter.take('a', t))).toEqual([0, 0, 0]);
	expect(limiter.take('a', t)).toBe(1); // empty: one token per second
	expect(limiter.take('b', t)).toBe(0); // other clients are separate
	expect(limiter.take('a', t + 1000)).toBe(0); // refilled one token
	expect(limiter.take('a', t + 1000)).toBe(1);
	expect([1, 2, 3].map(() => limiter.take('a', t + 60_000))).toEqual([0, 0, 0]); // capped at 3
	expect(limiter.take('a', t + 60_000)).toBe(1);
});

test('slow refill reports the wait in whole seconds', () => {
	const limiter = createLimiter(1, 1 / 60);
	expect(limiter.take('a', 0)).toBe(0);
	expect(limiter.take('a', 0)).toBe(60);
	expect(limiter.take('a', 30_000)).toBe(30);
	expect(limiter.take('a', 60_000)).toBe(0);
});

test('private, loopback and proxy-style addresses are recognised', () => {
	for (const ip of [
		'127.0.0.1',
		'10.0.3.7',
		'172.18.0.4',
		'192.168.1.20',
		'169.254.1.1',
		'::1',
		'fd12::3',
		'fe80::1',
		'::ffff:172.18.0.4'
	])
		expect(isPrivateAddress(ip)).toBe(true);
	for (const ip of [
		'93.184.216.34',
		'172.32.0.1',
		'8.8.8.8',
		'2a01:4f8::1',
		'::ffff:93.184.216.34'
	])
		expect(isPrivateAddress(ip)).toBe(false);
});
