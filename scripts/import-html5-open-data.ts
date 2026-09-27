/**
 * Runs the crawler's "missing Gemeinden from the html5 export" step (see
 * src/lib/server/scraper/html5OpenData.ts) for an election already in the database, then re-derives
 * party families and aggregates — without the rest of the crawl.
 *
 * Run with: bun run scripts/import-html5-open-data.ts 3 2021-03-14   (election type, date)
 *
 * Restart the dev server afterwards — its query cache still holds the old results.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { cities } from '../src/lib/server/db/schema';
import { importHtml5OpenData } from '../src/lib/server/scraper/html5OpenData';
import { remapPartyFamilies } from '../src/lib/server/scraper/runCrawl';

const [typeArg, date, parallelArg] = process.argv.slice(2);
if (!typeArg || !date)
	throw new Error('usage: import-html5-open-data.ts <election type> <date> [parallel]');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });

const log = (message: string) => {
	if (message && !message.startsWith('Wahlart-Muster')) console.log(message);
};
const cityList = (await db.select().from(cities)).flatMap((c) =>
	c.ags === null ? [] : [{ rs: c.rs, ags: c.ags, name: c.name }]
);
const electionTypeId = Number(typeArg);
await importHtml5OpenData(db, cityList, date, electionTypeId, log, Number(parallelArg ?? 8));
await remapPartyFamilies(db, { electionTypeId, date }, () => {});
console.log('Parteifamilien und Aggregate neu berechnet');
await client.end();
