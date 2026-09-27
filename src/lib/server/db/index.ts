import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from './relations';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// postgres.js defaults to a pool of 10 connections — fine normally, but the crawler's "parallel
// cities" setting (see scraper/client.ts's maxParallelism) can ask for more concurrent DB queries than
// that, in which case they'd just queue behind the pool instead of actually running concurrently.
const client = postgres(env.DATABASE_URL, { max: 20 });

export const db = drizzle({ client, relations });
