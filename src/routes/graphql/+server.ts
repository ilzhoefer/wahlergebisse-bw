import { createYoga } from '$lib/server/graphql';
import type { RequestHandler } from './$types';

const yoga = createYoga();

export const GET: RequestHandler = ({ request }) => yoga.fetch(request);
export const POST: RequestHandler = ({ request }) => yoga.fetch(request);
