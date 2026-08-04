<script lang="ts">
	import { untrack } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import MapView, { type RegionItem } from '$lib/components/MapView.svelte';
	import ResultPanel, { type RegionDetailData } from '$lib/components/ResultPanel.svelte';
	import { rsPrefix, STUTTGART_RS, NO_ELECTION_RS } from '$lib/map/rs';
	import type { MapMode, MapInformationMode } from '$lib/server/map/queries';
	import { client } from '$lib/generated-client/client';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	// Election types/dates come from the server load; everything else is client-driven selectors.
	let selectedElectionType = $state<number>(0);
	selectedElectionType = data.electionTypes[0]?.electionType ?? 0;
	const datesForType = $derived(
		(data.datesByType as Record<number, string[]>)[selectedElectionType] ?? []
	);
	let selectedDate = $state<string>('');
	$effect(() => {
		if (!datesForType.includes(selectedDate)) selectedDate = datesForType[0] ?? '';
	});

	// Numeric election_type convention (matches shiny_reactive_polygons in the legacy app): 2 = Bundestagswahl, 3 = Landtagswahl.
	const isBundestagOrLandtag = $derived(selectedElectionType === 2 || selectedElectionType === 3);
	let selectedVoteType = $state<'0' | '1'>('0');

	const modesForType = $derived(
		(data.mapModesByType as Record<number, { possibleModes: MapMode[]; selectedMode: MapMode }>)[
			selectedElectionType
		]
	);
	let selectedMapMode = $state<MapMode>('Gemeinde');
	$effect(() => {
		if (modesForType && !modesForType.possibleModes.includes(selectedMapMode))
			selectedMapMode = modesForType.selectedMode;
	});

	// Internal values stay the German domain vocabulary used throughout the backend/API — only the
	// displayed label is translated (see mapModeLabel/visualModeLabel below).
	const VISUAL_MODES: MapInformationMode[] = [
		'Stärkste Partei',
		'2. Stärkste Partei',
		'Wahlbeteiligung',
		'Hochburg'
	];
	let selectedVisualMode = $state<MapInformationMode>('Stärkste Partei');

	function mapModeLabel(mode: MapMode): string {
		switch (mode) {
			case 'Regierungsbezirk':
				return m.map_mode_regierungsbezirk();
			case 'Kreis':
				return m.map_mode_kreis();
			case 'Gemeinde':
				return m.map_mode_gemeinde();
			case 'Wahlkreis':
				return m.map_mode_wahlkreis();
			case 'Wahlbezirk':
				return m.map_mode_wahlbezirk();
		}
	}

	function visualModeLabel(mode: MapInformationMode): string {
		switch (mode) {
			case 'Stärkste Partei':
				return m.map_info_staerkste_partei();
			case '2. Stärkste Partei':
				return m.map_info_zweite_staerkste_partei();
			case 'Wahlbeteiligung':
				return m.map_info_wahlbeteiligung();
			case 'Hochburg':
				return m.map_info_hochburg();
		}
	}

	let parties = $state<{ nameShort: string; partyFamilyId: number }[]>([]);
	let selectedParty = $state<string>('');
	$effect(() => {
		if (selectedVisualMode !== 'Hochburg' || !selectedDate) return;
		// Capture reactive reads before untrack() below — see the note above the regionData effect
		// further down for why the client.query(...) call itself needs to be untracked, and why what
		// it depends on must be read outside of that.
		const args = { electionType: selectedElectionType, date: selectedDate };
		untrack(() =>
			client.query
				.parties({
					__args: args,
					nameShort: true,
					partyFamilyId: true
				})
				.then((rows) => {
					untrack(() => {
						parties = rows as { nameShort: string; partyFamilyId: number }[];
						if (!rows.some((p) => p.nameShort === selectedParty))
							selectedParty = rows[0]?.nameShort ?? '';
					});
				})
		);
	});

	// Drill-down: a stack of levels clicked into, deepest last. Empty means "show the dropdown-selected
	// mode's full dataset". `label` (the clicked region's own display name) drives the breadcrumb.
	interface DrillLevel {
		mode: MapMode;
		rsPrefixDigits?: 2 | 4;
		prefix?: string;
		label: string;
	}
	let drillStack = $state<DrillLevel[]>([]);
	const drill = $derived(drillStack.at(-1) ?? null);

	// Click-opened result panel: full ranked results (+ real seat data, when scraped) for one region.
	let panelOpen = $state(false);
	let panelLoading = $state(false);
	let panelRegionName = $state('');
	let panelModeLabel = $state('');
	let panelDetail = $state<RegionDetailData | null>(null);

	$effect(() => {
		// Any selector change resets an in-progress drill-down back to the top level of that mode, and
		// closes the result panel — it would otherwise show a now-stale region for the new selection.
		void selectedElectionType;
		void selectedDate;
		void selectedMapMode;
		void selectedVoteType;
		drillStack = [];
		panelOpen = false;
	});

	const effectiveMode = $derived(drill?.mode ?? selectedMapMode);

	const geoFileByMode: Record<MapMode, string | null> = {
		Regierungsbezirk: '/geo/regierungsbezirk.geojson',
		Kreis: '/geo/kreis.geojson',
		Gemeinde: '/geo/gemeinde.geojson',
		Wahlkreis: null, // depends on election type, see below
		Wahlbezirk: '/geo/stuttgart-bezirke.geojson'
	};

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain imperative cache, never read reactively/from the template
	const geoCache = new Map<string, FeatureCollection>();
	async function loadGeo(url: string): Promise<FeatureCollection> {
		const cached = geoCache.get(url);
		if (cached) return cached;
		const geo = (await fetch(url).then((r) => r.json())) as FeatureCollection;
		geoCache.set(url, geo);
		return geo;
	}

	let displayGeojson = $state<FeatureCollection>({ type: 'FeatureCollection', features: [] });
	let sourceKey = $state('');
	let keyProperty = $state('rs');
	let items = $state<RegionItem[]>([]);
	let legend = $state<{
		type: 'turnout' | 'party' | 'parties';
		min?: number;
		max?: number;
		partyName?: string;
		color?: string;
		entries?: { name: string; color: string }[];
	} | null>(null);

	// Drives the position indicator on the gradient (turnout/party) legends: the value of whichever
	// region is currently hovered, mapped onto the legend's min–max scale.
	let hoveredItem = $state<RegionItem | undefined>(undefined);
	function handleFeatureHover(item: RegionItem | undefined) {
		hoveredItem = item;
	}
	const hoveredValue = $derived.by(() => {
		if (!hoveredItem || !legend) return null;
		if (legend.type === 'turnout') return (hoveredItem.turnoutPercent as number | null) ?? null;
		if (legend.type === 'party' && !hoveredItem.notCompeting)
			return (hoveredItem.votePercent as number | null) ?? null;
		return null;
	});
	const hoveredMarkerPercent = $derived.by(() => {
		if (hoveredValue === null || legend?.min === undefined || legend?.max === undefined)
			return null;
		const { min, max } = legend;
		if (max === min) return 50;
		return Math.min(100, Math.max(0, ((hoveredValue - min) / (max - min)) * 100));
	});

	$effect(() => {
		const mode = effectiveMode;
		const prefix = drill?.prefix;
		const url =
			mode === 'Wahlkreis'
				? selectedElectionType === 3
					? '/geo/wahlkreis-landtag.geojson'
					: '/geo/wahlkreis-bundestag.geojson'
				: geoFileByMode[mode];
		if (!url) return;
		loadGeo(url).then((geo) => {
			if (mode === 'Wahlbezirk') {
				displayGeojson = {
					type: 'FeatureCollection',
					features: geo.features.filter((f) => f.properties?.date === selectedDate)
				};
			} else if (prefix && drill?.rsPrefixDigits) {
				displayGeojson = {
					type: 'FeatureCollection',
					features: geo.features.filter(
						(f) => rsPrefix(Number(f.properties?.rs), drill!.rsPrefixDigits!) === prefix
					)
				};
			} else {
				displayGeojson = geo;
			}
			keyProperty = mode === 'Wahlkreis' ? 'ref' : mode === 'Wahlbezirk' ? 'AWBEZ_T' : 'rs';
			sourceKey = `${mode}:${prefix ?? ''}:${selectedDate}`;
		});
	});

	$effect(() => {
		if (!selectedDate || !selectedElectionType) return;
		if (selectedVisualMode === 'Hochburg' && !selectedParty) return;
		const mode = effectiveMode;
		// Capture every reactive value this query depends on *before* the untrack() below — untrack
		// only needs to cover the client.query(...) call/result, not these reads, and reading them
		// inside untrack would silently stop the effect from re-running when they change.
		const args = {
			electionType: selectedElectionType,
			date: selectedDate,
			mapMode: mode,
			mapInformation: selectedVisualMode,
			party: selectedVisualMode === 'Hochburg' ? selectedParty : undefined,
			voteType: isBundestagOrLandtag ? selectedVoteType : undefined
		};
		// untrack: rumble's client.query(...) resolves with a reactive proxy, not plain data — reading
		// its properties calls Svelte's createSubscriber(), which (if effect tracking is active)
		// subscribes whatever reactive context is current to every future emission of this same query.
		// Under requestPolicy: 'cache-and-network', a *cache hit* resolves synchronously inside the
		// client.query(...) call itself (still inside this effect's tracked scope), and every call also
		// gets a second, later "network" emission — so without untracking both the call and the .then()
		// body, this effect ends up subscribed to its own query and re-triggers itself on that second
		// emission, which re-issues the query, which re-subscribes, forever: hits Svelte's
		// effect_update_depth_exceeded loop guard within a few round-trips. Same fix applied to the
		// parties effect above.
		untrack(() =>
			client.query
				.regionData({
					__args: args,
					keyField: true,
					legend: {
						type: true,
						min: true,
						max: true,
						partyName: true,
						color: true,
						entries: { name: true, color: true }
					},
					items: {
						key: true,
						color: true,
						turnoutPercent: true,
						votePercent: true,
						partyName: true,
						notCompeting: true
					}
				})
				.then((res) => {
					untrack(() => {
						items = res.items as unknown as RegionItem[];
						legend = res.legend as unknown as typeof legend;
					});
				})
		);
	});

	function handleFeatureClick(properties: Record<string, unknown>) {
		const clickedMode = effectiveMode;
		// 'WK Name' covers Wahlkreis polygons, which formatPopup's hover tooltip doesn't currently need
		// a name for (it only labels rs/AWBEZ_T-keyed regions) — the panel title needs one for every mode.
		const clickedName =
			(properties.name as string) ??
			(properties.AWBEZ_T as string) ??
			(properties['WK Name'] as string) ??
			'';
		const regionKeyNum = Number(properties[keyProperty]);

		if (clickedMode === 'Regierungsbezirk') {
			drillStack = [
				...drillStack,
				{ mode: 'Kreis', rsPrefixDigits: 2, prefix: rsPrefix(regionKeyNum, 2), label: clickedName }
			];
		} else if (clickedMode === 'Kreis') {
			drillStack = [
				...drillStack,
				{
					mode: 'Gemeinde',
					rsPrefixDigits: 4,
					prefix: rsPrefix(regionKeyNum, 4),
					label: clickedName
				}
			];
		} else if (clickedMode === 'Gemeinde' && regionKeyNum === STUTTGART_RS) {
			drillStack = [...drillStack, { mode: 'Wahlbezirk', label: clickedName }];
		}

		// Wahlbezirk regions are individual polling districts, not a governing/electoral unit of their
		// own — no result panel for them (yet). Gemeindefreie Gebiete never held an election at all.
		if (clickedMode === 'Wahlbezirk') return;
		if (keyProperty === 'rs' && NO_ELECTION_RS.has(regionKeyNum)) return;

		openPanel(clickedMode, regionKeyNum, clickedName);
	}

	function openPanel(mode: MapMode, regionKeyNum: number, name: string) {
		panelOpen = true;
		panelLoading = true;
		panelRegionName = name;
		panelModeLabel = mapModeLabel(mode);
		panelDetail = null;
		// Capture reactive reads before untrack() below — same reasoning as the regionData/parties
		// effects above: untrack only needs to cover the client.query(...) call/result.
		const args = {
			electionType: selectedElectionType,
			date: selectedDate,
			mapMode: mode,
			regionKey: String(regionKeyNum),
			voteType: isBundestagOrLandtag ? selectedVoteType : undefined
		};
		untrack(() =>
			client.query
				.regionDetail({
					__args: args,
					turnoutPercent: true,
					parties: {
						partyFamilyId: true,
						nameShort: true,
						color: true,
						votePercent: true,
						voteCount: true
					},
					seats: {
						total: true,
						groups: {
							partyFamilyId: true,
							nameShort: true,
							color: true,
							seatCount: true,
							candidateNames: true
						}
					}
				})
				.then((res) => {
					untrack(() => {
						panelDetail = {
							turnoutPercent: res.turnoutPercent,
							parties: res.parties as unknown as RegionDetailData['parties'],
							seats: res.seats as unknown as RegionDetailData['seats']
						};
						panelLoading = false;
					});
				})
		);
	}

	function formatPopup(
		properties: Record<string, unknown>,
		item: RegionItem | undefined
	): string | null {
		const name = (properties.name as string) ?? (properties.AWBEZ_T as string) ?? '';
		if (keyProperty === 'rs' && NO_ELECTION_RS.has(Number(properties.rs))) {
			return `<strong>${name}</strong><br/>${m.map_popup_keine_wahl()}`;
		}
		if (!item) return `<strong>${name}</strong><br/>${m.map_popup_keine_daten()}`;
		if (selectedVisualMode === 'Wahlbeteiligung') {
			const v = item.turnoutPercent as number | undefined;
			return `<strong>${name}</strong><br/>${m.map_popup_wahlbeteiligung({ value: v?.toFixed(2) ?? '–' })}`;
		}
		if (selectedVisualMode === 'Hochburg') {
			if (item.notCompeting)
				return `<strong>${name}</strong><br/>${m.map_popup_nicht_angetreten({ party: selectedParty })}`;
			return `<strong>${name}</strong><br/>${m.map_popup_ergebnis({ party: selectedParty, percent: (item.votePercent as number)?.toFixed(2) ?? '' })}`;
		}
		return `<strong>${name}</strong><br/>${item.partyName ?? ''}<br/>${(item.votePercent as number)?.toFixed(2)}%`;
	}
</script>

<div class="relative isolate h-screen w-screen">
	<MapView
		geojson={displayGeojson}
		{sourceKey}
		{keyProperty}
		{items}
		onFeatureClick={handleFeatureClick}
		onFeatureHover={handleFeatureHover}
		{formatPopup}
	/>

	<div class="absolute top-4 left-4 z-10 flex w-64 flex-col gap-3">
		<div class="space-y-3 rounded-lg bg-white/95 p-4 shadow-lg">
			<div class="flex items-center justify-between">
				<h1 class="text-lg font-semibold">{m.map_title()}</h1>
				<a href={resolve('/daten')} class="text-sm text-blue-700 underline"
					>{m.nav_daten_export()}</a
				>
			</div>

			<label class="block text-sm">
				{m.map_wahlart_label()}
				<select class="mt-1 w-full rounded border p-1" bind:value={selectedElectionType}>
					{#each data.electionTypes as t (t.electionType)}
						<option value={t.electionType}>{t.electionDescription}</option>
					{/each}
				</select>
			</label>

			<label class="block text-sm">
				{m.map_wahldatum_label()}
				<select class="mt-1 w-full rounded border p-1" bind:value={selectedDate}>
					{#each datesForType as d (d)}
						<option value={d}>{new Date(d).toLocaleDateString('de-DE')}</option>
					{/each}
				</select>
			</label>

			{#if isBundestagOrLandtag}
				<label class="block text-sm">
					{m.map_stimmtyp_label()}
					<select class="mt-1 w-full rounded border p-1" bind:value={selectedVoteType}>
						<option value="0">{m.map_erststimmen()}</option>
						<option value="1">{m.map_zweitstimmen()}</option>
					</select>
				</label>
			{/if}

			<label class="block text-sm">
				{m.map_kartengenauigkeit_label()}
				<select class="mt-1 w-full rounded border p-1" bind:value={selectedMapMode}>
					{#each modesForType?.possibleModes ?? [] as mode (mode)}
						<option value={mode}>{mapModeLabel(mode)}</option>
					{/each}
				</select>
			</label>

			<label class="block text-sm">
				{m.map_informationsmodus_label()}
				<select class="mt-1 w-full rounded border p-1" bind:value={selectedVisualMode}>
					{#each VISUAL_MODES as visualMode (visualMode)}
						<option value={visualMode}>{visualModeLabel(visualMode)}</option>
					{/each}
				</select>
			</label>

			{#if selectedVisualMode === 'Hochburg'}
				<label class="block text-sm">
					{m.map_partei_label()}
					<select class="mt-1 w-full rounded border p-1" bind:value={selectedParty}>
						{#each parties as p (p.partyFamilyId)}
							<option value={p.nameShort}>{p.nameShort}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if drillStack.length > 0}
				<nav class="flex flex-wrap items-center gap-1 text-sm">
					<button
						class="text-blue-700 underline"
						onclick={() => {
							drillStack = [];
							panelOpen = false;
						}}
					>
						{m.map_breadcrumb_root()}
					</button>
					{#each drillStack as level, i (i)}
						<span class="text-gray-400">›</span>
						{#if i === drillStack.length - 1}
							<span class="font-medium text-gray-900">{level.label}</span>
						{:else}
							<button
								class="text-blue-700 underline"
								onclick={() => {
									drillStack = drillStack.slice(0, i + 1);
									panelOpen = false;
								}}
							>
								{level.label}
							</button>
						{/if}
					{/each}
				</nav>
			{/if}
		</div>

		{#if legend}
			<div class="rounded-lg bg-white/95 p-3 text-sm shadow-lg">
				{#if legend.type === 'turnout'}
					<div class="mb-1 font-medium">{m.map_legend_wahlbeteiligung_title()}</div>
					<div class="relative h-3 w-full rounded">
						<div
							class="h-full w-full rounded"
							style="background: linear-gradient(to right, #f7fbff, #08306b)"
						></div>
						{#if hoveredMarkerPercent !== null}
							<div
								class="pointer-events-none absolute top-[-3px] h-[calc(100%+6px)] w-0.5 -translate-x-1/2 bg-red-600"
								style="left: {hoveredMarkerPercent}%"
								title={hoveredValue?.toFixed(1)}
							></div>
						{/if}
					</div>
					<div class="mt-1 flex justify-between">
						<span>{legend.min?.toFixed(0)}</span><span>{legend.max?.toFixed(0)}</span>
					</div>
				{:else if legend.type === 'party'}
					<div class="mb-1 font-medium">
						{m.map_legend_ergebnis_title({ party: legend.partyName ?? '' })}
					</div>
					<div class="relative h-3 w-full rounded">
						<div
							class="h-full w-full rounded"
							style={`background: linear-gradient(to right, white, ${legend.color})`}
						></div>
						{#if hoveredMarkerPercent !== null}
							<div
								class="pointer-events-none absolute top-[-3px] h-[calc(100%+6px)] w-0.5 -translate-x-1/2 bg-red-600"
								style="left: {hoveredMarkerPercent}%"
								title={hoveredValue?.toFixed(1)}
							></div>
						{/if}
					</div>
					<div class="mt-1 flex justify-between">
						<span>{legend.min?.toFixed(0)}%</span><span>{legend.max?.toFixed(0)}%</span>
					</div>
				{:else if legend.type === 'parties'}
					<div class="mb-1 font-medium">{visualModeLabel(selectedVisualMode)}</div>
					<ul class="max-h-48 space-y-1 overflow-y-auto">
						{#each legend.entries ?? [] as entry (entry.name)}
							<li class="flex items-center gap-1.5">
								<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: {entry.color}"
								></span>
								<span>{entry.name}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>

	<ResultPanel
		open={panelOpen}
		loading={panelLoading}
		regionName={panelRegionName}
		modeLabel={panelModeLabel}
		detail={panelDetail}
		onClose={() => (panelOpen = false)}
	/>
</div>
