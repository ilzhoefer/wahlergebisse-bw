/**
 * Fills `election_candidate` for elections already in the database (new crawls do it themselves):
 * list candidates of Gemeinderats- (6) and Kreistagswahlen (5), Erststimme candidates of Bundestags-
 * (2) and Landtagswahlen (3).
 *
 * Run with: bun run scripts/build-candidates.ts            (every such election)
 *           bun run scripts/build-candidates.ts 6 2024-06-09  (one election: type, date)
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { relations } from '../src/lib/server/db/relations';
import { elections } from '../src/lib/server/db/schema';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	updateCandidates,
	updateErststimmeCandidates,
	mandatePeople
} from '../src/lib/server/scraper/candidates';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const db = drizzle({ client, relations });

const [typeArg, dateArg] = process.argv.slice(2);
const targets = typeArg
	? [{ electionType: Number(typeArg), date: dateArg }]
	: await db
			.selectDistinct({ electionType: elections.electionType, date: elections.date })
			.from(elections)
			.where(inArray(elections.electionType, [2, 3, 5, 6]))
			.orderBy(elections.electionType, elections.date);

for (const t of targets) {
	if (t.electionType === null || !t.date) continue;
	const started = performance.now();
	const log = (msg: string) => msg && console.log(`  ${msg}`);
	if (t.electionType === 2 || t.electionType === 3) {
		// map/mandates.ts reads these via import.meta.glob, which only Vite understands.
		const file = path.resolve(__dirname, `../src/lib/server/map/mandates/${t.date}.json`);
		const mandates = existsSync(file)
			? Object.entries(JSON.parse(readFileSync(file, 'utf-8'))).map(([districtId, m]) => ({
					districtId,
					...(m as { direct: { name: string | null; party: string } | null; list: [] })
				}))
			: [];
		await updateErststimmeCandidates(db, t.date, t.electionType, mandatePeople(mandates), log);
	} else await updateCandidates(db, t.date, t.electionType, log);
	console.log(
		`election_type ${t.electionType} ${t.date}: done in ${((performance.now() - started) / 1000).toFixed(1)} s`
	);
}
await client.end();
