import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from './relations';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';

// `bun run build` loads server modules to analyse the app, with no database (the Docker build and CI
// have no .env). postgres.js only connects on the first query and the build runs none, so a missing
// URL only matters at runtime.
if (!DATABASE_URL && !building) throw new Error('DATABASE_URL is not set');

// postgres.js defaults to a pool of 10 connections — fine normally, but the crawler's "parallel
// cities" setting (see scraper/client.ts's maxParallelism) can ask for more concurrent DB queries than
// that, in which case they'd just queue behind the pool instead of actually running concurrently.
const client = postgres(DATABASE_URL ?? 'postgres://build-time-placeholder/none', { max: 20 });

export const db = drizzle({ client, relations });
