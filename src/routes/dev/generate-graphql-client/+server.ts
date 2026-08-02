import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { clientCreator } from '$lib/server/graphql';

/**
 * Dev-only trigger for regenerating the typed GraphQL client at src/lib/generated-client/. Hit
 * this route (GET /dev/generate-graphql-client) with the dev server running, whenever
 * src/lib/server/graphql/index.ts's query/mutation fields change — mirrors db:generate's role for
 * schema.ts changes. Disabled outside development (rumble's clientCreator writes to the filesystem,
 * which must never happen from a request handler in production).
 *
 * KNOWN ISSUES — re-add the manual patches documented at the top of src/lib/generated-client/client.ts
 * after every regeneration:
 * 1. Since our schema currently has no mutations/subscriptions, the generated client.ts references
 *    `Mutation`/`Subscription` types that don't get emitted, until Phase 3 adds real mutations
 *    (which will make the codegen emit them for real).
 * 2. The codegen doesn't emit a `keys` config for cacheExchange, so keyless computed types like
 *    RegionData/RegionItem hit an infinite requery loop under requestPolicy: 'cache-and-network' —
 *    see the patch note above `defaultOptions` in client.ts.
 */
export const GET = async () => {
	if (!dev) error(403, 'Only available in development');

	await clientCreator({
		// Relative, not an absolute dev-server URL — this client is only ever used from browser-side
		// Svelte code (never during SSR), where a relative URL resolves against the current origin
		// regardless of host/port, in both dev and production.
		apiUrl: '/graphql',
		outputPath: './src/lib/generated-client',
		rumbleImportPath: '@m1212e/rumble/client'
	});

	return json({ ok: true });
};
