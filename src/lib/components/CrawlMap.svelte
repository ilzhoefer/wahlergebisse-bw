<script lang="ts">
	import { onMount } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import MapView, { type RegionItem } from '$lib/components/MapView.svelte';
	import * as m from '$lib/paraglide/messages';

	type CityStatus = 'in_progress' | 'done' | 'skipped';
	type DisplayStatus = CityStatus | 'pending';

	let { cityStatus }: { cityStatus: Record<number, CityStatus> } = $props();

	const STATUSES: DisplayStatus[] = ['pending', 'in_progress', 'done', 'skipped'];

	const COLORS: Record<DisplayStatus, string> = {
		pending: '#e5e7eb',
		in_progress: '#2563eb',
		done: '#16a34a',
		skipped: '#d97706'
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
		fetch('/geo/gemeinde.geojson')
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

<div class="space-y-2">
	<h4 class="text-xs font-medium text-gray-500 uppercase">{m.admin_map_heading()}</h4>
	<div class="h-72 overflow-hidden rounded-lg border border-gray-200">
		<MapView {geojson} {sourceKey} keyProperty="rs" {items} {formatPopup} />
	</div>
	<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
		{#each STATUSES as status (status)}
			<span class="inline-flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full" style="background: {COLORS[status]}"></span>
				{statusLabel(status)}
			</span>
		{/each}
	</div>
</div>
