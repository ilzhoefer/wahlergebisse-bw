/**
 * Fills `election_candidate` for elections already in the database (new crawls do it themselves).
 * Only Gemeinderats- (6) and Kreistagswahlen (5) have candidate lists.
 *
 * Run with: bun run scripts/build-candidates.ts            (every such election)
 *           bun run scripts/build-candidates.ts 6 2024-06-09  (one election: type, date)
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { elections } from '../src/lib/server/db/schema';
import { updateCandidates } from '../src/lib/server/scraper/candidates';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });

const [typeArg, dateArg] = process.argv.slice(2);
const targets = typeArg
	? [{ electionType: Number(typeArg), date: dateArg }]
	: await db
			.selectDistinct({ electionType: elections.electionType, date: elections.date })
			.from(elections)
			.where(inArray(elections.electionType, [5, 6]))
			.orderBy(elections.electionType, elections.date);

for (const t of targets) {
	if (t.electionType === null || !t.date) continue;
	const started = performance.now();
	await updateCandidates(db, t.date, t.electionType, (msg) => msg && console.log(`  ${msg}`));
	console.log(
		`election_type ${t.electionType} ${t.date}: done in ${((performance.now() - started) / 1000).toFixed(1)} s`
	);
}
await client.end();
