/**
 * Re-applies the party-family mapping (and everything aggregated from it) to elections already in the
 * database — after changing party-families.csv (run `bun run db:seed` first) or the matching rules in
 * src/lib/server/scraper/partyFamily.ts. Fetches nothing from komm.one.
 *
 * Run with: bun run scripts/remap-parties.ts            (every election)
 *           bun run scripts/remap-parties.ts 2 2025-02-23  (one election: type, date)
 *
 * Restart the dev server afterwards — its query cache still holds the old results.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { elections } from '../src/lib/server/db/schema';
import { remapPartyFamilies } from '../src/lib/server/scraper/runCrawl';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });

const [typeArg, dateArg] = process.argv.slice(2);
const targets = typeArg
	? [{ electionType: Number(typeArg), date: dateArg }]
	: await db
			.selectDistinct({ electionType: elections.electionType, date: elections.date })
			.from(elections)
			.orderBy(elections.electionType, elections.date);

for (const t of targets) {
	if (t.electionType === null || !t.date) continue;
	const started = performance.now();
	await remapPartyFamilies(db, { electionTypeId: t.electionType, date: t.date }, () => {});
	console.log(
		`election_type ${t.electionType} ${t.date}: done in ${((performance.now() - started) / 1000).toFixed(1)} s`
	);
}
await client.end();
