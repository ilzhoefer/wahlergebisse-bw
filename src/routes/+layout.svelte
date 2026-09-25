<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	// The Kartenansicht (map view) and the admin page build the language switcher into their own
	// toolbars instead — a second, floating one would sit on top of it.
	const showFloatingSwitcher = $derived(!['/', '/admin'].includes(page.url.pathname));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Instrument Sans/Newsreader/Roboto Mono: Kartenansicht design tokens (see
	     src/lib/components/map/theme.css). Loaded app-wide rather than per-page since SvelteKit
	     doesn't guarantee <head> tags from a route's own markup land before first paint. -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Roboto+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if showFloatingSwitcher}
	<div class="fixed top-2 right-2 z-50">
		<LanguageSwitcher />
	</div>
{/if}

{@render children()}
