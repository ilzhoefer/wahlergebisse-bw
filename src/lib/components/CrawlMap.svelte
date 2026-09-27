<script lang="ts">
	import { onMount } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import MapView, { type RegionItem } from '$lib/components/MapView.svelte';
	import * as m from '$lib/paraglide/messages';
	import { GEO_URL } from '$lib/map/geoUrls';

	type CityStatus = 'in_progress' | 'done' | 'skipped';
	type DisplayStatus = CityStatus | 'pending';

	let { cityStatus }: { cityStatus: Record<number, CityStatus> } = $props();

	const STATUSES: DisplayStatus[] = ['pending', 'in_progress', 'done', 'skipped'];

	// Progress colours from the design tokens (theme.css); MapLibre paint needs literal values.
	const COLORS: Record<DisplayStatus, string> = {
		pending: '#cfc8ba',
		in_progress: '#e0b481',
		done: '#4f7a52',
		skipped: '#6f6658'
	};

	function statusLabel(status: DisplayStatus): string {
		switch (status) {
			case 'pending':
				return m.admin_map_status_pending();
			case 'in_progress':
				return m.admin_map_status_in_progress();
			case 'done':
				return m.admin_map_status_done();
			case 'skipped':
				return m.admin_map_status_skipped();
		}
	}

	// Loaded once — every municipality's polygon is fixed, only its fill color changes as `cityStatus`
	// streams in over SSE. `sourceKey` only changes once, from '' to 'gemeinde' the moment the real
	// geometry has loaded, so MapView rebuilds its source exactly once (matches the pattern the main
	// dashboard map uses for its own geojson loading).
	let geojson = $state<FeatureCollection>({ type: 'FeatureCollection', features: [] });
	let sourceKey = $state('');

	onMount(() => {
		fetch(GEO_URL.gemeinde)
			.then((r) => r.json())
			.then((geo: FeatureCollection) => {
				geojson = geo;
				sourceKey = 'gemeinde';
			});
	});

	const items = $derived(
		geojson.features.map((f) => {
			const rs = Number(f.properties?.rs);
			const status = cityStatus[rs] ?? 'pending';
			return { key: String(rs), color: COLORS[status], status } satisfies RegionItem;
		})
	);

	function formatPopup(properties: Record<string, unknown>, item: RegionItem | undefined) {
		const name = (properties.name as string) ?? '';
		const status = (item?.status as DisplayStatus | undefined) ?? 'pending';
		return `<strong>${name}</strong><br/>${statusLabel(status)}`;
	}
</script>

<MapView {geojson} {sourceKey} keyProperty="rs" {items} {formatPopup} />

<div class="legend">
	<span class="map-lbl" style="color: var(--map-ink); margin-bottom: 2px"
		>{m.admin_map_heading()}</span
	>
	{#each STATUSES as status (status)}
		<span class="row">
			<span class="swatch" style="background: {COLORS[status]}"></span>
			{statusLabel(status)}
		</span>
	{/each}
</div>

<style>
	.legend {
		position: absolute;
		bottom: 16px;
		left: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: rgba(255, 253, 248, 0.95);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		padding: 11px 13px;
		box-shadow: var(--map-shadow-overlay);
		z-index: 3;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--map-ink-2);
	}
	.swatch {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		flex: none;
		border: 0.5px solid var(--map-swatch-border);
	}
</style>
