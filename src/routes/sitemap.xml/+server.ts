import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { memo } from '$lib/server/queryCache';
import type { RequestHandler } from './$types';

/** The map plus every Gemeinde page with results — what search engines should find. */
export const GET: RequestHandler = async ({ url }) => {
	const rsList = await memo('sitemapGemeinden', null, async () => {
		const rows = (await db.execute(sql`
			SELECT DISTINCT rs FROM election_result_aggregate_meta_region
			WHERE rs IN (SELECT rs FROM cities) ORDER BY rs
		`)) as unknown as { rs: string }[];
		return rows.map((r) => r.rs);
	});
	const loc = (path: string) => `<url><loc>${url.origin}${path}</loc></url>`;
	const body = [loc('/'), ...rsList.map((rs) => loc(`/gemeinde/${rs}`))].join('');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
		{ headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
	);
};
