<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import SiteLinks from '$lib/components/SiteLinks.svelte';

	let { children } = $props();
</script>

<div class="info mx-auto max-w-2xl space-y-6 p-6 pb-10">
	<a href={resolve('/')} class="text-sm text-blue-700 underline">{m.nav_back_to_map()}</a>
	{@render children()}
	<SiteLinks class="border-t pt-4 text-gray-600" />
</div>

<style>
	/* Plain prose styling for the text pages (no typography plugin in this project). */
	.info :global(h1) {
		font-size: 1.25rem;
		font-weight: 600;
	}
	.info :global(h2) {
		font-size: 1.05rem;
		font-weight: 600;
		margin-top: 1.75rem;
	}
	.info :global(h3) {
		font-weight: 600;
		margin-top: 1rem;
	}
	.info :global(p),
	.info :global(li) {
		font-size: 0.9rem;
		line-height: 1.55;
		margin-top: 0.5rem;
	}
	.info :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.info :global(a) {
		color: rgb(29 78 216);
		text-decoration: underline;
	}
	.info :global(.note) {
		color: rgb(75 85 99);
		font-size: 0.8rem;
	}
</style>
