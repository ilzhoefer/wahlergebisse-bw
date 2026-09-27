/**
 * Fetches the elected Kreistag members for elections already in the database (new crawls do it
 * themselves), then rebuilds election_candidate so candidate pages show who was elected.
 * Calls komm.one: two requests per Landkreis.
 *
 * Run with: bun run scripts/fetch-kreistag-elected.ts 2024-06-09
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { getElectedKreistagMembers } from '../src/lib/server/scraper/kreistagMembers';
import { updateCandidates } from '../src/lib/server/scraper/candidates';

const [date] = process.argv.slice(2);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
	throw new Error('usage: fetch-kreistag-elected.ts YYYY-MM-DD');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });
const log = (msg: string) => msg && console.log(msg);

await getElectedKreistagMembers(db, date, log);
await updateCandidates(db, date, 5, log);
await client.end();
