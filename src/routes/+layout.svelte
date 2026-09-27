<script lang="ts">
	import './layout.css';
	import '$lib/fonts.css';
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
</svelte:head>

{#if showFloatingSwitcher}
	<div class="fixed top-2 right-2 z-50">
		<LanguageSwitcher />
	</div>
{/if}

{@render children()}
