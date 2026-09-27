import type { RequestHandler } from './$types';

/** Dynamic only because the Sitemap line needs the absolute origin. */
export const GET: RequestHandler = ({ url }) =>
	new Response(`User-agent: *\nDisallow: /admin\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
