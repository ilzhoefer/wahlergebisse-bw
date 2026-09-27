<script lang="ts">
	import type { Snippet } from 'svelte';
	import '$lib/components/map/theme.css';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

	/** The map page's header style for the secondary pages (Daten-Export, info pages). */
	interface Props {
		/** Mono label under the wordmark, e.g. "Daten-Export". */
		kicker: string;
		/** Controls between the brand and the right-hand links (e.g. the election select). */
		children?: Snippet;
	}
	let { kicker, children }: Props = $props();

	const localeLabels: Record<string, string> = { de: 'DE', en: 'EN' };
</script>

<header class="site-header">
	<a class="brand-block" href={resolve('/')}>
		<span class="logo">
			<span class="bar" style="height: 8px"></span>
			<span class="bar" style="height: 15px"></span>
			<span class="bar" style="height: 11px"></span>
		</span>
		<span class="wordmark">
			<span class="brand">{m.map_brand_name()}</span>
			<span class="map-lbl kicker">{kicker}</span>
		</span>
	</a>
	{@render children?.()}
	<span class="spacer"></span>
	<a class="back" href={resolve('/')}>{m.nav_back_to_map()}</a>
	<div class="segmented">
		{#each locales as locale (locale)}
			<button
				type="button"
				class="pill"
				class:active={getLocale() === locale}
				onclick={() => setLocale(locale)}>{localeLabels[locale] ?? locale}</button
			>
		{/each}
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 14px;
		padding: 10px 14px;
		min-height: 60px;
		box-sizing: border-box;
		background: var(--map-bg-surface);
		border-bottom: 1px solid var(--map-border-strong);
		font-family: var(--map-font-body);
	}
	.brand-block {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: var(--map-ink);
	}
	.logo {
		width: 26px;
		height: 26px;
		flex: none;
		border-radius: 4px;
		background: var(--map-accent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2px;
		padding: 5px;
		box-sizing: border-box;
	}
	.bar {
		width: 4px;
		background: var(--map-on-dark);
		border-radius: 1px;
	}
	.wordmark {
		display: flex;
		flex-direction: column;
		line-height: 1;
		padding-right: 13px;
		border-right: 1px solid var(--map-border-soft);
	}
	.brand {
		font-family: var(--map-font-heading);
		font-size: 15px;
		font-weight: 500;
	}
	.kicker {
		color: var(--map-accent);
		margin-top: 3px;
	}
	.spacer {
		flex: 1;
	}
	.back {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-accent);
		text-decoration: none;
	}
	.back:hover {
		color: var(--map-accent-hover);
	}
	.segmented {
		display: flex;
		padding: 2px;
		background: var(--map-bg-surface-sunken);
		border-radius: 7px;
	}
	.pill {
		font-family: var(--map-font-body);
		padding: 3px 8px;
		border-radius: 5px;
		font-size: 11.5px;
		font-weight: 500;
		background: transparent;
		color: var(--map-ink-3);
		border: none;
		cursor: pointer;
	}
	.pill.active {
		background: var(--map-ink);
		color: var(--map-on-dark);
		font-weight: 600;
	}
</style>
