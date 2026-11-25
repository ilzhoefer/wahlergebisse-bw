import { createYoga } from '$lib/server/graphql';
import type { RequestHandler } from './$types';

// Yoga 6 logs every request at info level; keep only warnings and errors.
const yoga = createYoga({ logging: 'warn' });

export const GET: RequestHandler = ({ request }) => yoga.fetch(request);
export const POST: RequestHandler = ({ request }) => yoga.fetch(request);
