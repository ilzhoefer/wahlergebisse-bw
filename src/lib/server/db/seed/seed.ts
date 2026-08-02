/**
 * Seeds the static reference data the scraper only ever reads, never writes: `cities`,
 * `party` (party families) and `election_type`. Nothing in `src/lib/server/scraper/*` inserts into
 * these tables (see e.g. `runCrawl.ts`'s `db.select().from(cities)`) — without this data the admin
 * crawl has no cities to iterate over and no party-family/election-type rows to join against.
 *
 * Source data ported from the legacy scraper's `R-Code/Database/{cities,party,election_type}.csv`
 * exports (see `data/`) so this script keeps working once the legacy R/Shiny directories are removed.
 *
 * Idempotent — safe to re-run; existing rows are updated in place (upsert on the natural key).
 *
 * Run with: bun run db:seed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from '../relations';
import { cities, party, electionType } from '../schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(process.env.DATABASE_URL);
const db = drizzle({ client, relations });

/** Minimal RFC 4180 parser — handles quoted fields containing commas, newlines and escaped quotes. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
			continue;
		}

		if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += c;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function readCsvRecords(file: string): Record<string, string>[] {
	const [header, ...rows] = parseCsv(readFileSync(path.join(DATA_DIR, file), 'utf-8'));
	return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])));
}

async function seedCities() {
	const rows = readCsvRecords('cities.csv').map((r) => ({
		rs: Number(r.rs),
		ags: r.ags ? Number(r.ags) : null,
		name: r.name || null,
		population: r.population ? Number(r.population) : null
	}));

	await db
		.insert(cities)
		.values(rows)
		.onConflictDoUpdate({
			target: cities.rs,
			set: {
				ags: sql`excluded.ags`,
				name: sql`excluded.name`,
				population: sql`excluded.population`
			}
		});
	console.log(`cities: seeded ${rows.length} rows`);
}

async function seedPartyFamilies() {
	const rows = readCsvRecords('party-families.csv').map((r) => ({
		partyFamilyId: Number(r.party_family_id),
		nameShort: r.name_short || null,
		nameLong: r.name_long || null,
		color: r.color || null
	}));

	await db
		.insert(party)
		.values(rows)
		.onConflictDoUpdate({
			target: party.partyFamilyId,
			set: {
				nameShort: sql`excluded.name_short`,
				nameLong: sql`excluded.name_long`,
				color: sql`excluded.color`
			}
		});
	console.log(`party (families): seeded ${rows.length} rows`);
}

async function seedElectionTypes() {
	const rows = readCsvRecords('election-types.csv').map((r) => ({
		electionType: Number(r.election_type),
		electionDescription: r.election_description || null
	}));

	await db
		.insert(electionType)
		.values(rows)
		.onConflictDoUpdate({
			target: electionType.electionType,
			set: { electionDescription: sql`excluded.election_description` }
		});
	console.log(`election_type: seeded ${rows.length} rows`);
}

async function main() {
	await seedCities();
	await seedPartyFamilies();
	await seedElectionTypes();
	await client.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
