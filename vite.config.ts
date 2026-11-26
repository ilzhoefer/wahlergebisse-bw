import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// graphql-armor imports `graphql/language/parser.mjs` from its own nested graphql 16; bundled, that bare
	// import would resolve to the top-level graphql 17, whose exports map hides the subpath.
	ssr: { external: ['@escape.tech/graphql-armor'] },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Scripts only from this origin, with Kit's per-request nonces: a script smuggled into
			// scraped data can't run. Styles stay 'unsafe-inline' for Svelte's style="" attributes.
			// frame-ancestors is added per response in hooks.server.ts (the embed view may be framed).
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self', 'https://tiles.openfreemap.org'],
					'worker-src': ['self', 'blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// Real files, not Paraglide 3's Vite-only virtual modules: scripts/check-*.ts import messages under plain Bun.
			outputStructure: 'message-modules'
		})
	]
});
