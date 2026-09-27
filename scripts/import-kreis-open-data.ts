/**
 * Runs the crawler's "missing Gemeinden from Kreis open data" step for an election that's already in
 * the database, then re-derives party families and aggregates for it — without re-crawling komm.one.
 *
 * Run with: bun run scripts/import-kreis-open-data.ts 2 2025-02-23   (election type, date)
 *
 * Restart the dev server afterwards — its query cache still holds the old results.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { cities } from '../src/lib/server/db/schema';
import { importKreisOpenData } from '../src/lib/server/scraper/kreisOpenData';
import { setElectionType } from '../src/lib/server/scraper/elections';
import { remapPartyFamilies } from '../src/lib/server/scraper/runCrawl';

const [typeArg, date] = process.argv.slice(2);
if (!typeArg || !date) throw new Error('usage: import-kreis-open-data.ts <election type> <date>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });

const log = (message: string) => console.log(message);
const cityList = (await db.select().from(cities)).flatMap((c) =>
	c.ags === null ? [] : [{ rs: c.rs, ags: c.ags, name: c.name }]
);
await importKreisOpenData(db, cityList, date, log);
await setElectionType(db, () => {});
await remapPartyFamilies(db, { electionTypeId: Number(typeArg), date }, () => {});
console.log('Parteifamilien und Aggregate neu berechnet');
await client.end();
