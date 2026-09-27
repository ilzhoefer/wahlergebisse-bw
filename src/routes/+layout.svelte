<script lang="ts">
	import './layout.css';
	import '$lib/fonts.css';
	import favicon from '$lib/assets/favicon.svg';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	// Every other page builds the language switcher into its own header — a second, floating one
	// would sit on top of it. Only the admin login keeps the floating one.
	const showFloatingSwitcher = $derived(page.url.pathname.startsWith('/admin/login'));
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
