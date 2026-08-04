<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Map as MapLibreMap,
		NavigationControl,
		Popup,
		setWorkerUrl,
		type MapLayerMouseEvent
	} from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { bbox } from '@turf/turf';
	import type { FeatureCollection } from 'geojson';

	// MapLibre locates its tile-processing worker via a URL relative to its own bundled chunk at
	// runtime (import.meta.url + './maplibre-gl-worker.mjs') — Vite doesn't statically detect that
	// pattern inside the pre-built maplibre-gl.mjs, so the worker chunk never gets emitted and that
	// request 404s. Without it, the GeoJSON source we add for the region polygons silently never
	// tiles — no fill layer, no click/hover queries — even though the raster basemap looks fine.
	// Fix: serve maplibre-gl's worker + its "shared" chunk verbatim from static/ (copied from
	// node_modules/maplibre-gl/dist/ — re-copy if the maplibre-gl version bumps) so the worker's own
	// hardcoded `from "./maplibre-gl-shared.mjs"` import resolves against a real sibling file. A
	// Vite `?url` import doesn't work here: it renames the file, which breaks that relative import.
	setWorkerUrl('/maplibre-gl-worker.mjs');

	export interface RegionItem {
		key: string;
		color: string | null;
		[extra: string]: unknown;
	}

	interface Props {
		geojson: FeatureCollection;
		/** Changing this forces the source to be recreated and the view fit to the new geometry — use
		 * a value that changes on map-mode switches and drill-downs, but not on every selector tweak. */
		sourceKey: string;
		/** GeoJSON feature property to key `items` against (rs / ref / AWBEZ_T). */
		keyProperty: string;
		items: RegionItem[];
		onFeatureClick?: (properties: Record<string, unknown>) => void;
		formatPopup?: (
			properties: Record<string, unknown>,
			item: RegionItem | undefined
		) => string | null;
		/** Fires with the hovered feature's matching item, or `undefined` on hover-out — lets the
		 * legend show where the hovered region sits on a scaled (gradient) legend. */
		onFeatureHover?: (item: RegionItem | undefined) => void;
	}

	let {
		geojson,
		sourceKey,
		keyProperty,
		items,
		onFeatureClick,
		formatPopup,
		onFeatureHover
	}: Props = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let loadedSourceKey: string | undefined;
	const SOURCE_ID = 'regions';
	const FILL_LAYER = 'regions-fill';
	const LINE_LAYER = 'regions-line';

	onMount(() => {
		map = new MapLibreMap({
			container,
			style: {
				version: 8,
				sources: {
					osm: {
						type: 'raster',
						tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
						tileSize: 256,
						attribution:
							'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					}
				},
				layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
			},
			center: [9.18, 48.7],
			zoom: 7
		});
		map.addControl(new NavigationControl(), 'top-right');

		const popup = new Popup({ closeButton: false, closeOnClick: false });

		map.on('click', FILL_LAYER, (e: MapLayerMouseEvent) => {
			const feature = e.features?.[0];
			if (feature) onFeatureClick?.(feature.properties ?? {});
		});
		map.on('mousemove', FILL_LAYER, (e: MapLayerMouseEvent) => {
			if (!map) return;
			map.getCanvas().style.cursor = 'pointer';
			const feature = e.features?.[0];
			if (!feature) return;
			const item = items.find((i) => i.key === String(feature.properties?.[keyProperty]));
			const text = formatPopup?.(feature.properties ?? {}, item);
			if (text) popup.setLngLat(e.lngLat).setHTML(text).addTo(map);
			else popup.remove();
			onFeatureHover?.(item);
		});
		map.on('mouseleave', FILL_LAYER, () => {
			if (map) map.getCanvas().style.cursor = '';
			popup.remove();
			onFeatureHover?.(undefined);
		});

		// Container sizing can still be settling (fonts/layout not yet final, a still-animating parent,
		// etc.) when MapLibre reads its size at construction — if that happens to be a moment of zero or
		// stale size, the canvas is born wrong and nothing after ever fixes it on its own (this is a
		// well-known MapLibre/Mapbox GL gotcha, not specific to this component). Keep it honest for the
		// whole lifetime of the component, not just once at startup.
		const resizeObserver = new ResizeObserver(() => map?.resize());
		resizeObserver.observe(container);

		rebuildSource();

		return () => {
			resizeObserver.disconnect();
			map?.remove();
		};
	});

	function rebuildSource() {
		if (!map) return;
		if (!map.isStyleLoaded()) {
			// Rather than silently doing nothing and hoping some *other* future prop change happens to
			// retrigger this (sourceKey may never change again after this first, too-early call), retry
			// once the map has actually settled. `rebuildSource` always re-reads the current `sourceKey`/
			// `geojson`/`items` props, so calling it again later is correct even if they changed meanwhile.
			map.once('idle', rebuildSource);
			return;
		}
		if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
		if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
		if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

		map.addSource(SOURCE_ID, { type: 'geojson', data: geojson, promoteId: keyProperty });
		map.addLayer({
			id: FILL_LAYER,
			type: 'fill',
			source: SOURCE_ID,
			paint: {
				'fill-color': ['coalesce', ['feature-state', 'color'], 'rgba(0,0,0,0)'],
				'fill-opacity': 0.75
			}
		});
		map.addLayer({
			id: LINE_LAYER,
			type: 'line',
			source: SOURCE_ID,
			paint: { 'line-color': '#1d4ed8', 'line-width': 1 }
		});

		loadedSourceKey = sourceKey;
		applyFeatureState();

		if (geojson.features.length > 0) {
			const [minX, minY, maxX, maxY] = bbox(geojson);
			map.fitBounds(
				[
					[minX, minY],
					[maxX, maxY]
				],
				{ padding: 20, duration: 0 }
			);
		}
	}

	function applyFeatureState() {
		if (!map || !map.getSource(SOURCE_ID)) return;
		map.removeFeatureState({ source: SOURCE_ID });
		for (const item of items) {
			if (item.color === null) continue;
			map.setFeatureState({ source: SOURCE_ID, id: item.key }, item);
		}
	}

	$effect(() => {
		if (sourceKey !== loadedSourceKey) rebuildSource();
	});

	$effect(() => {
		void items; // declare reactive dependency: re-apply feature state whenever items changes
		if (sourceKey === loadedSourceKey) applyFeatureState();
	});
</script>

<div bind:this={container} class="h-full w-full"></div>

<style>
	/* The LanguageSwitcher is fixed to the same top-right viewport corner as this control (by
	   design — that's the conventional spot for a language switcher). Push the control down so
	   the two don't overlap. */
	:global(.maplibregl-ctrl-top-right .maplibregl-ctrl) {
		margin-top: 3rem !important;
	}
</style>
