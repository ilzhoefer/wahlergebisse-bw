/**
 * Smoke test against a running production build (CI runs it on an empty, migrated database):
 * pages answer, the admin gate holds, the export validates its URL, and the security headers and
 * compression are in place. Catches what type-checking can't, e.g. a dependency that 500s every
 * request or a build that doesn't start.
 *
 * Run with: bun run scripts/smoke.ts [baseUrl]   (default http://localhost:3000)
 */
const base = process.argv[2] ?? 'http://localhost:3000';
const failures: string[] = [];

async function check(name: string, run: () => Promise<string | null>) {
	try {
		const problem = await run();
		console.log(`${problem ? '✗' : '✓'} ${name}${problem ? `: ${problem}` : ''}`);
		if (problem) failures.push(name);
	} catch (err) {
		console.log(`✗ ${name}: ${(err as Error).message}`);
		failures.push(name);
	}
}

const get = (path: string, init?: RequestInit) =>
	fetch(base + path, { redirect: 'manual', ...init });
const expectStatus = (res: Response, status: number) =>
	res.status === status ? null : `status ${res.status}, expected ${status}`;

for (const path of ['/', '/daten', '/ueber', '/impressum', '/datenschutz', '/sitemap.xml']) {
	await check(`GET ${path}`, async () => expectStatus(await get(path), 200));
}

await check('GET /healthz reaches the database', async () => {
	const res = await get('/healthz');
	return expectStatus(res, 200) ?? ((await res.text()) === 'ok' ? null : 'body is not "ok"');
});

await check('GraphQL answers', async () => {
	const res = await get('/graphql', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query: '{ electionTypes { electionType } }' })
	});
	const body = (await res.json()) as { data?: { electionTypes?: unknown[] } };
	return expectStatus(res, 200) ?? (Array.isArray(body.data?.electionTypes) ? null : 'no data');
});

await check('admin page redirects to the login', async () => {
	const res = await get('/admin');
	return (
		expectStatus(res, 303) ??
		(res.headers.get('location') === '/admin/login' ? null : `to ${res.headers.get('location')}`)
	);
});

await check('admin API refuses without a session', async () =>
	expectStatus(
		await get('/admin/crawl', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		}),
		401
	)
);

await check('export rejects a malformed URL', async () =>
	expectStatus(await get('/daten/export/abc/2024-06-09.zip'), 404)
);

await check('export answers 404 for an election without results', async () =>
	expectStatus(await get('/daten/export/6/1999-01-01.zip'), 404)
);

await check('CSP with a script nonce, framing refused', async () => {
	const csp = (await get('/')).headers.get('content-security-policy') ?? '';
	if (!/script-src[^;]*'nonce-/.test(csp)) return 'no script nonce';
	return csp.includes("frame-ancestors 'none'") ? null : 'no frame-ancestors';
});

await check('the embed view may be framed', async () => {
	const res = await get('/?embed=1');
	const csp = res.headers.get('content-security-policy') ?? '';
	return csp.includes('frame-ancestors') || res.headers.has('x-frame-options')
		? 'framing headers present'
		: null;
});

await check('pages are gzip-compressed', async () => {
	const res = await get('/daten', { headers: { 'Accept-Encoding': 'gzip' } });
	return res.headers.get('content-encoding') === 'gzip' ? null : 'not compressed';
});

await check('robots.txt keeps crawlers off the exports', async () =>
	(await (await get('/robots.txt')).text()).includes('Disallow: /daten/export/')
		? null
		: 'rule missing'
);

if (failures.length) {
	console.error(`\n${failures.length} smoke check(s) failed`);
	process.exit(1);
}
console.log('\nsmoke ok');
