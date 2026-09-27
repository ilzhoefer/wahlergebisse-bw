<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import SiteHeader from '$lib/components/SiteHeader.svelte';

	let { children } = $props();

	const pages = [
		{ href: resolve('/ueber'), label: m.nav_about },
		{ href: resolve('/impressum'), label: m.nav_impressum },
		{ href: resolve('/datenformat'), label: m.nav_datenformat },
		{ href: resolve('/datenschutz'), label: m.nav_datenschutz }
	];
</script>

<div class="map-root page">
	<SiteHeader kicker={m.map_brand_region()} />

	<div class="layout">
		<nav class="side-nav" aria-label={m.info_nav_heading()}>
			<span class="map-lbl nav-heading">{m.info_nav_heading()}</span>
			{#each pages as p (p.href)}
				<a
					href={p.href}
					class:current={page.url.pathname === p.href}
					aria-current={page.url.pathname === p.href ? 'page' : undefined}>{p.label()}</a
				>
			{/each}
		</nav>
		<article class="info">
			{@render children()}
		</article>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		color: var(--map-ink);
	}
	.layout {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 28px 20px 48px;
		box-sizing: border-box;
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: flex-start;
	}
	.side-nav {
		flex: 0 0 200px;
		position: sticky;
		top: 84px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-heading {
		color: var(--map-ink-muted);
		padding: 0 10px 8px;
	}
	.side-nav a {
		padding: 8px 10px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		color: var(--map-ink-3);
	}
	.side-nav a:hover {
		color: var(--map-ink);
	}
	.side-nav a.current {
		font-weight: 600;
		color: var(--map-ink);
		background: var(--map-bg-surface);
		box-shadow: 0 0 0 1px var(--map-border-strong);
	}
	@media (max-width: 759px) {
		.layout {
			padding: 16px 16px 40px;
			gap: 16px;
		}
		/* Above the content as a wrapping row of links. */
		.side-nav {
			flex: 1 1 100%;
			position: static;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}
		.nav-heading {
			display: none;
		}
	}
	.info {
		flex: 1 1 480px;
		min-width: 0;
		max-width: 680px;
		background: var(--map-bg-surface);
		border: 1px solid rgba(33, 29, 24, 0.14);
		border-radius: 8px;
		box-shadow: var(--map-shadow-card);
		padding: 28px 32px 32px;
		box-sizing: border-box;
	}
	@media (max-width: 759px) {
		.info {
			padding: 22px 18px 26px;
		}
	}
	.info :global(h1) {
		margin: 0 0 18px;
		font-family: var(--map-font-heading);
		font-size: 32px;
		font-weight: 500;
		line-height: 1.1;
	}
	.info :global(h2) {
		margin: 28px 0 8px;
		padding-top: 18px;
		border-top: 1px solid var(--map-border-soft);
		font-family: var(--map-font-heading);
		font-size: 21px;
		font-weight: 500;
	}
	.info :global(h3) {
		margin: 18px 0 8px;
		font: 500 9.5px var(--map-font-mono);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--map-accent);
	}
	.info :global(p),
	.info :global(li) {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.6;
		color: var(--map-ink-2);
		text-wrap: pretty;
	}
	.info :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.info :global(a) {
		color: var(--map-accent);
	}
	.info :global(a:hover) {
		color: var(--map-accent-hover);
	}
	.info :global(.note) {
		margin: 4px 0 14px;
		padding: 10px 12px;
		border-radius: 6px;
		background: var(--map-bg-list-a);
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--map-ink-3);
	}
	.info :global(.address) {
		color: var(--map-ink);
	}
</style>
