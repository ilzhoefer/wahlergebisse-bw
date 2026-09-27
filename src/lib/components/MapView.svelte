<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Map as MapLibreMap,
		NavigationControl,
		Popup,
		setWorkerUrl,
		type ExpressionSpecification,
		type GeoJSONSource,
		type MapLayerMouseEvent
	} from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { bbox, pointOnFeature } from '@turf/turf';
	import type { Feature, FeatureCollection, Point } from 'geojson';
	import { stripeImage } from '$lib/map/colors';

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
		/** Two hex colours to draw as 45° stripes over the area instead of the flat `color`. */
		stripe?: [string, string];
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
		/** Subset to fit the view to, if narrower than `geojson` (e.g. only the current drill scope,
		 * while `geojson` still carries everything else for context). Defaults to `geojson` itself. */
		fitBoundsGeojson?: FeatureCollection;
		/** Subset to label, if narrower than `geojson` (labels are typically wanted only for the current
		 * scope's children, not for dimmed out-of-scope context). Defaults to `geojson` itself. */
		labelGeojson?: FeatureCollection;
		onFeatureClick?: (properties: Record<string, unknown>) => void;
		formatPopup?: (
			properties: Record<string, unknown>,
			item: RegionItem | undefined
		) => string | null;
		/** Fires with the hovered feature's matching item (or `undefined` on hover-out), the cursor's
		 * position relative to the map container, and the feature's raw properties — the latter two let
		 * a caller position and populate its own hover-card overlay (see the Kartenansicht page) from data
		 * that isn't in `items` (keyed differently, or fetched separately), instead of relying on
		 * `formatPopup`'s built-in popup. */
		onFeatureHover?: (
			item: RegionItem | undefined,
			point?: { x: number; y: number },
			properties?: Record<string, unknown>
		) => void;
		/** GeoJSON feature property to show as a non-interactive map label (e.g. `name`). Omit for no
		 * labels (the admin crawl-progress map doesn't want them). */
		labelProperty?: string;
		/** false disables scroll-zoom/drag-pan/box-zoom/drag-rotate/double-click-zoom and the zoom
		 * control. Defaults to true (free pan/zoom) — every current MapView usage wants normal map
		 * navigation in addition to click-to-drill. */
		interactive?: boolean;
		/** true animates `rebuildSource`'s `fitBounds` (the click-dummy's `.5s cubic-bezier(.4,0,.2,1)`
		 * scope-change zoom) instead of snapping instantly. Independent of `interactive` — the
		 * Kartenansicht wants both a smooth zoom on drill-down *and* free manual pan/zoom the rest of the
		 * time. Defaults to false (instant), matching every other MapView usage. */
		animateFit?: boolean;
		/** Dot-density points (each with a `color` property), drawn above the area outlines. */
		dots?: FeatureCollection<Point> | null;
	}

	let {
		geojson,
		sourceKey,
		keyProperty,
		items,
		fitBoundsGeojson,
		labelGeojson,
		onFeatureClick,
		formatPopup,
		onFeatureHover,
		labelProperty,
		interactive = true,
		animateFit = false,
		dots = null
	}: Props = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let loadedSourceKey: string | undefined;
	const SOURCE_ID = 'regions';
	const FILL_LAYER = 'regions-fill';
	const LINE_LAYER = 'regions-line';
	// fill-pattern can't be driven by feature-state, so striped areas get their own source: a copy of
	// just those features, each tagged with its pattern image id.
	const STRIPE_SOURCE_ID = 'regions-stripes';
	const STRIPE_LAYER = 'regions-stripes';
	/** Stripe tile sizes (device px; drawn at pixelRatio 2, so the bands are size/4 CSS px wide) — one
	 * image per size, picked by zoom in the stripe layer's `fill-pattern` step expression. */
	const STRIPE_SIZES = [20, 32, 64, 128, 192];
	const stripeId = (size: number): ExpressionSpecification => [
		'concat',
		['get', '__stripe'],
		`-${size}`
	];
	const DOT_SOURCE_ID = 'dots';
	const DOT_LAYER = 'dots';
	const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
	const LABEL_SOURCE_ID = 'regions-label-points';
	const LABEL_LAYER = 'regions-label';

	/** One label point per feature (via turf's `pointOnFeature`, which — unlike a centroid — is
	 * guaranteed to fall inside the geometry). A symbol layer reading `text-field` straight off the
	 * polygon source instead would label *every polygon part* of a MultiPolygon (Regierungsbezirke like
	 * Freiburg are several disjoint parts) — and MapLibre also re-tiles GeoJSON sources internally, so a
	 * large polygon can pick up one label per internal tile on top of that. A single Point feature has
	 * neither problem: exactly one label, always. */
	function toLabelPoints(fc: FeatureCollection): FeatureCollection<Point> {
		return {
			type: 'FeatureCollection',
			features: fc.features.map((f): Feature<Point> => ({
				type: 'Feature',
				properties: f.properties,
				geometry: pointOnFeature(f).geometry
			}))
		};
	}

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
			zoom: 7,
			scrollZoom: interactive,
			dragPan: interactive,
			boxZoom: interactive,
			dragRotate: interactive,
			touchZoomRotate: interactive,
			doubleClickZoom: interactive
		});
		if (interactive) map.addControl(new NavigationControl(), 'top-right');

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
			onFeatureHover?.(item, e.point, feature.properties ?? {});
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
		if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER);
		if (map.getLayer(DOT_LAYER)) map.removeLayer(DOT_LAYER);
		if (map.getSource(DOT_SOURCE_ID)) map.removeSource(DOT_SOURCE_ID);
		if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
		if (map.getLayer(STRIPE_LAYER)) map.removeLayer(STRIPE_LAYER);
		if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
		if (map.getSource(STRIPE_SOURCE_ID)) map.removeSource(STRIPE_SOURCE_ID);
		if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
		if (map.getSource(LABEL_SOURCE_ID)) map.removeSource(LABEL_SOURCE_ID);

		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: geojson,
			promoteId: keyProperty,
			// MapLibre re-tiles every GeoJSON source through geojson-vt, which by default (tolerance
			// 0.375) re-simplifies each polygon *independently* per tile — unlike mapshaper's shared-arc
			// simplification (see prepare-geo-data.ts), geojson-vt has no notion of a boundary shared
			// between two features, so it can nudge two already-identical adjacent coordinates apart
			// again at render time even though the source GeoJSON's borders match exactly. Our data is
			// already simplified to an appropriate size offline, so there's nothing to gain (and this
			// seam to lose) by letting MapLibre simplify it a second time.
			tolerance: 0
		});
		map.addLayer({
			id: FILL_LAYER,
			type: 'fill',
			source: SOURCE_ID,
			paint: {
				'fill-color': ['coalesce', ['feature-state', 'color'], 'rgba(0,0,0,0)'],
				'fill-opacity': 0.9,
				// Adjacent polygons are triangulated independently; each one's anti-aliased edge blends
				// toward the basemap right at the shared boundary, and where two edges don't land on
				// exactly the same pixels this leaves a thin sliver of basemap showing through. Disabling
				// anti-aliasing removes that per-polygon edge blending (the line layer already draws a
				// crisp boundary on top, so the loss of edge smoothing isn't visible).
				'fill-antialias': false
			}
		});
		map.addSource(STRIPE_SOURCE_ID, {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] },
			tolerance: 0 // same seam reasoning as the main source above
		});
		map.addLayer({
			id: STRIPE_LAYER,
			type: 'fill',
			source: STRIPE_SOURCE_ID,
			paint: {
				// Patterns draw at a fixed screen size, so swap in wider stripes as the map zooms in —
				// fine hatching over a whole Gemeinde is hard on the eyes.
				'fill-pattern': [
					'step',
					['zoom'],
					stripeId(20),
					9,
					stripeId(32),
					11,
					stripeId(64),
					12,
					stripeId(128),
					13.5,
					stripeId(192)
				],
				'fill-opacity': 0.9,
				'fill-antialias': false
			}
		});
		map.addLayer({
			id: LINE_LAYER,
			type: 'line',
			source: SOURCE_ID,
			paint: {
				// Two adjacent polygons are triangulated independently by the GPU, and their edges don't
				// always land on exactly the same pixels — a sub-pixel rendering seam that shows up as a
				// thin gap even when the underlying GeoJSON borders match exactly (verified against the
				// source data directly). A thin, mostly-transparent line (the previous 1px/.45 alpha)
				// doesn't fully cover that gap; widening and darkening it does, at the cost of a slightly
				// more prominent boundary.
				'line-color': 'rgba(33,29,24,.85)',
				'line-width': 1.5
			}
		});
		map.addSource(DOT_SOURCE_ID, { type: 'geojson', data: dots ?? EMPTY });
		map.addLayer({
			id: DOT_LAYER,
			type: 'circle',
			source: DOT_SOURCE_ID,
			paint: {
				'circle-color': ['get', 'color'],
				// Grow with zoom so dots stay readable without merging into blobs at state level.
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1, 9, 1.8, 12, 3, 15, 5],
				'circle-opacity': 0.85
			}
		});
		if (labelProperty) {
			map.addSource(LABEL_SOURCE_ID, {
				type: 'geojson',
				data: toLabelPoints(labelGeojson ?? geojson)
			});
			// MapLibre's built-in label collision detection stands in for the click-dummy's manual
			// "only label a region once its on-screen area clears ~2600px²" rule (see its `labelVals`) —
			// symbols that would overlap are hidden automatically as the view zooms/pans.
			map.addLayer({
				id: LABEL_LAYER,
				type: 'symbol',
				source: LABEL_SOURCE_ID,
				layout: {
					// A feature's own `label` (e.g. Wahlbezirk "Möhringen 012-03") wins over labelProperty.
					'text-field': ['coalesce', ['get', 'label'], ['get', labelProperty]],
					'text-font': ['Noto Sans Regular'],
					'text-size': 11.5,
					'text-allow-overlap': false
				},
				paint: {
					'text-color': '#211d18',
					'text-halo-color': 'rgba(255,253,248,.9)',
					'text-halo-width': 1.5
				}
			});
		}

		loadedSourceKey = sourceKey;
		applyFeatureState();
		applyFit();
	}

	/** Re-fits the camera to `fitBoundsGeojson` (or `geojson` itself if narrower). Called both from
	 * `rebuildSource()` (a real source/layer rebuild) and from the effect below, which re-fits on its
	 * own whenever just `fitBoundsGeojson` changes — e.g. clicking a breadcrumb only changes which
	 * region is *focused*, not which regions are *expanded* on the map (see the Kartenansicht page's
	 * `goTo`/`goUp`), so `sourceKey` stays the same and `rebuildSource()` never runs, yet the camera
	 * still needs to zoom to the newly-focused region. */
	function applyFit() {
		if (!map) return;
		const fitTo = fitBoundsGeojson ?? geojson;
		if (fitTo.features.length === 0) return;
		const [minX, minY, maxX, maxY] = bbox(fitTo);
		map.fitBounds(
			[
				[minX, minY],
				[maxX, maxY]
			],
			animateFit
				? { padding: 20, duration: 500, easing: (t) => 1 - (1 - t) ** 3 }
				: { padding: 20, duration: 0 }
		);
	}

	function applyFeatureState() {
		if (!map || !map.getSource(SOURCE_ID)) return;
		map.removeFeatureState({ source: SOURCE_ID });
		for (const item of items) {
			if (item.color === null) continue;
			map.setFeatureState({ source: SOURCE_ID, id: item.key }, item);
		}
		applyStripes();
	}

	function applyStripes() {
		const source = map?.getSource(STRIPE_SOURCE_ID) as GeoJSONSource | undefined;
		if (!map || !source) return;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local lookup, built and consumed within this call
		const stripeByKey = new Map<string, string>();
		for (const { key, stripe } of items) {
			if (!stripe) continue;
			const id = `stripe-${stripe[0]}-${stripe[1]}`;
			// pixelRatio 2 keeps them crisp on HiDPI screens; one image per zoom step (see the layer).
			for (const size of STRIPE_SIZES)
				if (!map.hasImage(`${id}-${size}`))
					map.addImage(`${id}-${size}`, stripeImage(stripe[0], stripe[1], size), {
						pixelRatio: 2
					});
			stripeByKey.set(key, id);
		}
		source.setData({
			type: 'FeatureCollection',
			features: geojson.features.flatMap((f) => {
				const id = stripeByKey.get(String(f.properties?.[keyProperty]));
				return id ? [{ ...f, properties: { ...f.properties, __stripe: id } }] : [];
			})
		});
	}

	let lastFitGeojson: FeatureCollection | undefined;
	$effect(() => {
		if (sourceKey !== loadedSourceKey) {
			rebuildSource();
			lastFitGeojson = fitBoundsGeojson ?? geojson;
			return;
		}
		const fitTo = fitBoundsGeojson ?? geojson;
		if (fitTo !== lastFitGeojson) {
			lastFitGeojson = fitTo;
			applyFit();
		}
	});

	$effect(() => {
		void items; // declare reactive dependency: re-apply feature state whenever items changes
		if (sourceKey === loadedSourceKey) applyFeatureState();
	});

	$effect(() => {
		const data = dots ?? EMPTY;
		(map?.getSource(DOT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(data);
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
