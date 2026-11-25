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
			adapter: adapter()
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
