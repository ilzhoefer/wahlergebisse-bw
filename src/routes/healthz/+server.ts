import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/** For the container health check: 200 while the app answers and reaches its database, 503 otherwise. */
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return new Response('database unreachable', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' }
		});
	}
};
