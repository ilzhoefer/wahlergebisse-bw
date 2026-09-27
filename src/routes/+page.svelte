<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import MapView, { type RegionItem } from '$lib/components/MapView.svelte';
	import Toolbar, { type Tab, type SelectOption } from '$lib/components/map/Toolbar.svelte';
	import ResultPanel, {
		type PanelRow,
		type PeopleGroup
	} from '$lib/components/map/ResultPanel.svelte';
	import SearchBox, { type SearchHit } from '$lib/components/map/SearchBox.svelte';
	import { searchPlaces, type Place } from '$lib/map/search';
	import { makeDots, niceDotValue, type DotArea } from '$lib/map/dots';
	import type { CandidateHit } from '$lib/generated-client/client';
	import HoverCard from '$lib/components/map/HoverCard.svelte';
	import Legend from '$lib/components/map/Legend.svelte';
	import BreadcrumbPill from '$lib/components/map/BreadcrumbPill.svelte';
	import ModeBadge from '$lib/components/map/ModeBadge.svelte';
	import StatusLine from '$lib/components/map/StatusLine.svelte';
	import '$lib/components/map/theme.css';
	import {
		GEO_URL,
		wahlbezirkeUrl,
		wahlbezirkGemeinden,
		wahlbezirkPostalEstimated
	} from '$lib/map/geoUrls';
	import {
		readShareParams,
		writeShareParams,
		levelOfRs,
		type ShareEbene,
		type VisualMode
	} from '$lib/map/shareUrl';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { rsPrefix, STUTTGART_RS, KREISFREIE_STADT_RS, NO_ELECTION_RS } from '$lib/map/rs';
	import { LAND_ROOT, hasChildren, childLevel, type MapLevel, type PathEntry } from '$lib/map/path';
	import { turnoutColorScale, partyColorScale, diffColorScale, paleColor } from '$lib/map/colors';
	import type { MapMode, MapInformationMode, RegionBreakdown } from '$lib/server/map/queries';
	import { client } from '$lib/generated-client/client';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	// ---- Election / date / vote-type selectors -----------------------------------------------

	/** State from a shared link (see $lib/map/shareUrl) — applied once on load; the focused region is
	 * restored asynchronously in `restoreSharedFocus` since it needs region names from the geo files. */
	const shared = readShareParams(page.url.searchParams);

	let selectedElectionType = $state<number>(0);
	// Start on the shared link's election, else the most recent one: the type with the newest date
	// (ties — several types voted the same day — keep `electionTypes` order). The date effect below
	// then keeps the shared date if valid, else picks that type's newest date.
	{
		const byType = data.datesByType as Record<number, string[]>;
		const newest = (t: number) => (byType[t] ?? []).reduce((a, b) => (b > a ? b : a), '');
		selectedElectionType =
			data.electionTypes.find((t) => t.electionType === shared.wahl)?.electionType ??
			data.electionTypes.reduce<number | undefined>(
				(best, t) =>
					best === undefined || newest(t.electionType) > newest(best) ? t.electionType : best,
				undefined
			) ??
			0;
	}

	// Most recent first — matches the click-dummy's own ELECTIONS[].dates convention and its
	// onElection handler, which resets to `dates[0]` expecting that to be the newest.
	const datesForType = $derived(
		[
			...(((data.datesByType as Record<number, string[]>)[selectedElectionType] ?? []) as string[])
		].sort((a, b) => b.localeCompare(a))
	);
	let selectedDate = $state<string>(shared.datum ?? '');
	$effect(() => {
		if (!datesForType.includes(selectedDate)) selectedDate = datesForType[0] ?? '';
	});

	const isBundestagOrLandtag = $derived(selectedElectionType === 2 || selectedElectionType === 3);
	/** Elections with both an Erst- and a Zweitstimme — Bundestag always, Landtag only since the 2026
	 * two-vote reform (2021 had a single vote). Gates the Stimmensplitting mode. */
	const hasTwoVotes = $derived(
		selectedElectionType === 2 || (selectedElectionType === 3 && selectedDate >= '2026')
	);
	let selectedVoteType = $state<'0' | '1'>(shared.stimme ?? '0');
	// Single-vote Landtagswahl (2021 and earlier): its one vote is stored as votetype 0.
	$effect(() => {
		if (!hasTwoVotes) selectedVoteType = '0';
	});
	let selectedVisualMode = $state<VisualMode>(shared.modus ?? 'Stärkste Partei');
	const splitting = $derived(selectedVisualMode === 'Stimmensplitting');
	const changing = $derived(selectedVisualMode === 'Veränderung');
	const dotMode = $derived(selectedVisualMode === 'Punkte');
	/** Modes that colour by one selected party (and so show the party select). */
	const usesParty = $derived(selectedVisualMode === 'Hochburg' || splitting || changing);
	$effect(() => {
		if (!selectedDate) return;
		if ((splitting && !hasTwoVotes) || (changing && datesForType.length < 2))
			selectedVisualMode = 'Stärkste Partei';
	});

	/** Veränderung: the earlier (or, failing that, any other) date of the same election type. */
	let selectedCompareDate = $state<string>(shared.vergleich ?? '');
	/** Left panel: vote counts instead of shares ("Stimmen" / "Anteil" switch, or click a value). */
	let absoluteValues = $state(shared.werte === 'absolut');
	const compareDates = $derived(datesForType.filter((d) => d !== selectedDate));
	$effect(() => {
		if (!compareDates.includes(selectedCompareDate))
			selectedCompareDate = compareDates.find((d) => d < selectedDate) ?? compareDates[0] ?? '';
	});

	const currentElectionDescription = $derived(
		data.electionTypes.find((t) => t.electionType === selectedElectionType)?.electionDescription ??
			''
	);
	const formattedSelectedDate = $derived(
		selectedDate ? new Date(selectedDate).toLocaleDateString('de-DE') : ''
	);
	const electionLabelText = $derived(`${currentElectionDescription} ${formattedSelectedDate}`);

	function onElectionChange(value: string) {
		selectedElectionType = Number(value);
		selectedVoteType = '0';
		// Only Bundestags-/Landtagswahl have Wahlkreise — fall back to Regierungsbezirk instead of
		// leaving an empty map.
		if (wahlkreisActive && !isBundestagOrLandtag) onEbeneChange('Regierungsbezirk');
		selectedWahlkreis = null;
		hoveredProps = undefined;
		// `expanded`/`focused` are deliberately preserved across election changes (see the click-dummy's
		// own comment: "the level path is preserved") — only date/Stimme/hover reset.
	}
	function onDateChange(value: string) {
		selectedDate = value;
		hoveredProps = undefined;
	}

	const electionOptions = $derived<SelectOption[]>(
		data.electionTypes.map((t) => ({ value: String(t.electionType), label: t.electionDescription }))
	);
	const dateOptions = $derived<SelectOption[]>(
		datesForType.map((d) => ({ value: d, label: new Date(d).toLocaleDateString('de-DE') }))
	);
	const stimmeTabs = $derived<Tab[] | null>(
		// Stimmensplitting compares both votes, so there's no single Stimme to pick.
		hasTwoVotes && !splitting
			? [
					{
						key: 'e',
						label: m.map_erststimmen(),
						active: selectedVoteType === '0',
						onClick: () => {
							selectedVoteType = '0';
							hoveredProps = undefined;
						}
					},
					{
						key: 'z',
						label: m.map_zweitstimmen(),
						active: selectedVoteType === '1',
						onClick: () => {
							selectedVoteType = '1';
							hoveredProps = undefined;
						}
					}
				]
			: null
	);

	// ---- Colouring mode + Hochburg party ------------------------------------------------------

	// Internal values stay the German domain vocabulary used throughout the backend/API — only the
	// displayed label is translated (see visualModeLabel below). "2. Stärkste Partei" is kept as a
	// fourth option beyond the click-dummy's three (confirmed with the user — see the plan file).
	const VISUAL_MODES: VisualMode[] = [
		'Stärkste Partei',
		'2. Stärkste Partei',
		'Wahlbeteiligung',
		'Hochburg',
		'Stimmensplitting',
		'Veränderung',
		'Punkte'
	];

	function visualModeLabel(mode: VisualMode): string {
		switch (mode) {
			case 'Stärkste Partei':
				return m.map_info_staerkste_partei();
			case '2. Stärkste Partei':
				return m.map_info_zweite_staerkste_partei();
			case 'Wahlbeteiligung':
				return m.map_info_wahlbeteiligung();
			case 'Hochburg':
				return m.map_info_hochburg();
			case 'Stimmensplitting':
				return m.map_info_stimmensplitting();
			case 'Veränderung':
				return m.map_info_veraenderung();
			case 'Punkte':
				return m.map_info_punkte();
		}
	}

	const modusTabs = $derived<Tab[]>(
		VISUAL_MODES.filter(
			(mode) =>
				(mode !== 'Stimmensplitting' || hasTwoVotes) &&
				(mode !== 'Veränderung' || datesForType.length > 1)
		).map((mode) => ({
			key: mode,
			label: visualModeLabel(mode),
			active: selectedVisualMode === mode,
			onClick: () => {
				selectedVisualMode = mode;
				hoveredProps = undefined;
			}
		}))
	);

	let parties = $state<{ nameShort: string; partyFamilyId: number }[]>([]);
	let selectedParty = $state<string>(shared.partei ?? '');
	$effect(() => {
		if (!usesParty || !selectedDate) return;
		// Capture reactive reads before untrack() — see the note above the breakdown-fetch effect
		// further down for why the client.query(...) call itself needs to be untracked, and why what
		// it depends on must be read outside of that.
		const args = { electionType: selectedElectionType, date: selectedDate };
		untrack(() =>
			client.query.parties({ __args: args, nameShort: true, partyFamilyId: true }).then((rows) => {
				untrack(() => {
					parties = rows as { nameShort: string; partyFamilyId: number }[];
					if (!rows.some((p) => p.nameShort === selectedParty) && !changeMetric)
						selectedParty = rows[0]?.nameShort ?? '';
				});
			})
		);
	});
	/** Veränderung can also compare turnout or the strongest/second-strongest party instead of one
	 * party's share — offered as extra entries at the top of the party select, stored in
	 * `selectedParty` (no party is called like these). */
	const CHANGE_METRICS = ['Wahlbeteiligung', 'Stärkste Partei', '2. Stärkste Partei'] as const;
	type ChangeMetric = (typeof CHANGE_METRICS)[number];
	const changeMetric = $derived(
		changing && (CHANGE_METRICS as readonly string[]).includes(selectedParty)
			? (selectedParty as ChangeMetric)
			: null
	);
	// Leaving Veränderung with a metric selected: back to a real party.
	$effect(() => {
		if (!changing && (CHANGE_METRICS as readonly string[]).includes(selectedParty))
			selectedParty = untrack(() => parties[0]?.nameShort ?? '');
	});
	/** The party select's current choice as display text (a metric's translated name, or the party). */
	const selectedPartyLabel = $derived(changeMetric ? visualModeLabel(changeMetric) : selectedParty);
	const hochburgPartyOptions = $derived<SelectOption[] | null>(
		usesParty
			? [
					...(changing ? CHANGE_METRICS.map((v) => ({ value: v, label: visualModeLabel(v) })) : []),
					...parties.map((p) => ({ value: p.nameShort, label: p.nameShort }))
				]
			: null
	);
	function onHbPartyChange(value: string) {
		selectedParty = value;
		hoveredProps = undefined;
	}
	const compareOptions = $derived<SelectOption[] | null>(
		changing
			? compareDates.map((d) => ({ value: d, label: new Date(d).toLocaleDateString('de-DE') }))
			: null
	);
	function onCompareChange(value: string) {
		selectedCompareDate = value;
		hoveredProps = undefined;
	}
	/** Year of the comparison election, for short labels ("ggü. 2021"). */
	const compareYear = $derived(selectedCompareDate.slice(0, 4));

	// Regionalwahl only elects in the Verband Region Stuttgart, not statewide — unlike every other
	// election type here, so the Gemeinde-grain geometry below needs to be told which Gemeinden that
	// actually covers (see eligibleGemeinden's doc comment; it isn't a clean Kreis-level boundary, so
	// this can't just be a hardcoded rs-prefix list). `null` (not yet fetched, or not Regionalwahl) means
	// "don't filter" — every other election type covers ~all of Baden-Württemberg's Gemeinden anyway.
	const REGIONALWAHL_TYPE = 4;
	// Kreisfreie Städte are their own Kreis (see KREISFREIE_STADT_RS's doc comment) and so never hold a
	// Kreistagswahl of their own — used by the hover card below to explain that explicitly rather than
	// just showing no data.
	const KREISTAGSWAHL_TYPE = 5;
	const GEMEINDERATSWAHL_TYPE = 6;
	/** Gemeinden with data for the selected election — fetched for every election (the panel's
	 * missing-results note needs it), but only *filters the map* for Regionalwahl. */
	let gemeindenWithData = $state<Set<number> | null>(null);
	const eligibleGemeindeRs = $derived(
		selectedElectionType === REGIONALWAHL_TYPE ? gemeindenWithData : null
	);
	$effect(() => {
		gemeindenWithData = null;
		if (!selectedDate || !selectedElectionType) return;
		const args = { electionType: selectedElectionType, date: selectedDate };
		untrack(() =>
			client.query.eligibleGemeinden({ __args: args, rsList: true }).then((result) => {
				untrack(() => {
					// Ignore a response that arrives after the user already switched elsewhere.
					if (args.electionType !== selectedElectionType || args.date !== selectedDate) return;
					gemeindenWithData = new Set((result.rsList as string[]).map(Number));
				});
			})
		);
	});
	/** Every Gemeinde rs in the geometry — the "should have data" baseline for the missing note. */
	let allGemeindeRs = $state<number[] | null>(null);
	$effect(() => {
		untrack(() =>
			loadGeo(GEO_URL.gemeinde).then((geo) => {
				allGemeindeRs = geo.features.map((f) => Number(f.properties?.rs));
			})
		);
	});

	// ---- Drill hierarchy (Land → Regierungsbezirk → Kreis → Gemeinde → Wahlbezirk) -----------
	//
	// Every drilled-into region stays expanded independently (see `expanded` below) — a further
	// evolution of the click-dummy's single linear `path`/`open()`/`goTo()` model (Klickdummy
	// Kartenansicht.dc.html lines 443–460) to support multiple simultaneously drilled-into branches.
	// See src/lib/map/path.ts's doc comment.

	/** Every region the user has drilled into so far — each one's own shape is replaced by its children
	 * on the map. Independent of each other: expanding Karlsruhe and then Stuttgart leaves *both*
	 * subdivided into their Kreise at once, matching "a click only affects the region I'm clicking in" —
	 * it never collapses a previously-expanded sibling. Only reset wipes this back to empty (the
	 * initial view: all four Regierungsbezirke, whole). */
	let expanded = $state<PathEntry[]>([]);
	/** The region the left panel currently shows stats for — independent of `expanded` above (a leaf
	 * click, e.g. a Gemeinde with no children of its own, focuses it without expanding anything). */
	let focused = $state<PathEntry>(LAND_ROOT);
	/** The Gemeinden that open into their Wahlbezirke — only where we have their boundaries. */
	const bezirkGemeinden = $derived(wahlbezirkGemeinden(selectedDate));
	const hasKids = (level: MapLevel, rs: number | null) => hasChildren(level, rs, bezirkGemeinden);
	const leaf = $derived(!hasKids(focused.level, focused.rs));
	// Switching to an election without a Gemeinde's Wahlbezirke: it becomes a plain Gemeinde again.
	$effect(() => {
		const cities = bezirkGemeinden;
		untrack(() => {
			const stale = (n: PathEntry) => n.level === 'Gemeinde' && n.rs !== null && !cities.has(n.rs);
			const parent = expanded.find((n) => stale(n) && n.rs === focused.rs);
			if (focused.level === 'Wahlbezirk' && parent) focused = parent;
			if (expanded.some(stale)) expanded = expanded.filter((n) => !stale(n));
		});
	});

	function parentLevelOf(level: MapLevel): MapLevel {
		switch (level) {
			case 'Regierungsbezirk':
				return 'Land';
			case 'Kreis':
				return 'Regierungsbezirk';
			case 'Gemeinde':
				return 'Kreis';
			case 'Wahlbezirk':
				return 'Gemeinde';
			default:
				return 'Land';
		}
	}
	/** The rs a node's parent would have. `rsPrefix` returns just the bare leading digits (e.g. "81"),
	 * but a Regierungsbezirk/Kreis's own `rs` is that prefix zero-padded back out to full length (e.g.
	 * 81000000000) — see rs.ts's doc comment — so it must be re-padded here to match what's actually
	 * stored in `expanded`/on the geojson features. */
	function parentRsOf(entry: PathEntry): number | null {
		switch (entry.level) {
			case 'Kreis':
				return Number(rsPrefix(entry.rs!, 2).padEnd(11, '0'));
			case 'Gemeinde':
				return Number(rsPrefix(entry.rs!, 4).padEnd(11, '0'));
			case 'Wahlbezirk':
				return entry.rs;
			default:
				return null;
		}
	}
	/** Every ancestor of `focused` is, by construction, already in `expanded` (you can only click —
	 * and so focus — a region that's currently rendered, which requires its parent to already be
	 * expanded) — so the breadcrumb is just that chain, looked up rather than separately tracked. */
	function ancestorChain(node: PathEntry): PathEntry[] {
		const chain: PathEntry[] = [node];
		let current = node;
		while (current.level !== 'Land') {
			const pLevel = parentLevelOf(current.level);
			const parent: PathEntry =
				pLevel === 'Land'
					? LAND_ROOT
					: (expanded.find((n) => n.level === pLevel && n.rs === parentRsOf(current)) ?? LAND_ROOT);
			// A kreisfreie Stadt's Kreis-level ancestor is the exact same polygon as its Gemeinde entry
			// already at the front of the chain (see KREISFREIE_STADT_RS/handleFeatureClick) — skip
			// adding it a second time, but keep walking up from it so its own ancestors (the
			// Regierungsbezirk) still get added normally.
			const isRedundantKreisfreiCrumb =
				parent.level === 'Kreis' &&
				KREISFREIE_STADT_RS.has(parent.rs ?? -1) &&
				parent.rs === chain[0].rs;
			if (!isRedundantKreisfreiCrumb) chain.unshift(parent);
			current = parent;
		}
		return chain;
	}
	const focusedChain = $derived(ancestorChain(focused));
	const crumbs = $derived(
		focusedChain.map((p, i, arr) => ({ name: p.name, current: i === arr.length - 1 }))
	);
	const canGoUp = $derived(focused.level !== 'Land');
	const panelParentEntry = $derived(
		focusedChain.length > 1 ? focusedChain[focusedChain.length - 2] : null
	);

	/** The toolbar's Ebene: the coarsest grain the map ever shows. The mosaic (see the
	 * geometry-loading effect) starts with every region at this grain — "Gemeinde" shows every
	 * Gemeinde state-wide, never a whole Kreis or Regierungsbezirk — and clicks only drill further
	 * down from there, so the Ebene stays true however far the user drills. */
	let baseLevel = $state<MapLevel>(
		shared.ebene && shared.ebene !== 'Wahlkreis' ? shared.ebene : 'Regierungsbezirk'
	);
	const LEVEL_DEPTH: Record<MapLevel, number> = {
		Land: 0,
		Regierungsbezirk: 1,
		Kreis: 2,
		Gemeinde: 3,
		Wahlbezirk: 4
	};
	// Never 'Land' — Land always has children, so this is always one of the four levels below it.
	// Focused on a region coarser than the Ebene (e.g. a Regierungsbezirk breadcrumb while on
	// "Gemeinde"), its children are still drawn at the Ebene's grain.
	const displayLevel = $derived.by((): MapLevel => {
		if (leaf) return focused.level;
		const child = childLevel(focused.level)!;
		return LEVEL_DEPTH[child] >= LEVEL_DEPTH[baseLevel] ? child : baseLevel;
	});

	/** A click always affects only the region clicked: it focuses it and — if it has children — adds
	 * it to `expanded`, never touching any other region's expansion (see the mosaic built in the
	 * geometry-loading effect below). The clicked feature carries its own `__grain` (tagged when the
	 * mosaic was built), which is what makes this work for *any* currently-rendered region, not just
	 * the current focus's own children — clicking a still-whole sibling Regierungsbezirk expands
	 * *that* one directly, alongside whatever was already expanded. */
	/** Computes whatever RB/Kreis ancestors of `entry` are missing from `expanded` — needed when the
	 * Ebene is finer than Regierungsbezirk: the mosaic then starts with (say) every Gemeinde already
	 * shown, so a click on one never went through its Kreis/Regierungsbezirk first, yet the breadcrumb
	 * (see `ancestorChain`) is built from `expanded`. Deliberately read-only (returns the entries to add
	 * instead of writing `expanded` itself): `handleFeatureClick` awaits this *before* touching any
	 * reactive state, so `focused`/`expanded` both land in one atomic update once this
	 * resolves — see that function's own comment for why a two-step update breaks the map. Under normal
	 * step-by-step drilling this always returns `[]`, since every ancestor is already in `expanded` by
	 * construction (see the module doc above). */
	async function missingAncestors(entry: PathEntry): Promise<PathEntry[]> {
		const toAdd: PathEntry[] = [];
		if (entry.level === 'Kreis' || entry.level === 'Gemeinde') {
			const rbRs = Number(rsPrefix(entry.rs!, 2).padEnd(11, '0'));
			if (!expanded.some((n) => n.level === 'Regierungsbezirk' && n.rs === rbRs)) {
				const rbGeo = await loadGeo(GEO_URL.regierungsbezirk);
				const feature = rbGeo.features.find((f) => Number(f.properties?.rs) === rbRs);
				toAdd.push({
					level: 'Regierungsbezirk',
					rs: rbRs,
					name: String(feature?.properties?.name ?? '')
				});
			}
		}
		if (entry.level === 'Gemeinde') {
			const kreisRs = Number(rsPrefix(entry.rs!, 4).padEnd(11, '0'));
			if (!expanded.some((n) => n.level === 'Kreis' && n.rs === kreisRs)) {
				const kreisGeo = await loadGeo(GEO_URL.kreis);
				const feature = kreisGeo.features.find((f) => Number(f.properties?.rs) === kreisRs);
				toAdd.push({ level: 'Kreis', rs: kreisRs, name: String(feature?.properties?.name ?? '') });
			}
		}
		return toAdd;
	}

	/** Resolving `missingAncestors` needs an `await` (it may have to fetch Kreis geometry that was never
	 * loaded), so `handleFeatureClick` itself is async and awaits it *before* writing `focused`/
	 * `expanded` — both are then set together in one synchronous block, so the mosaic-building effect
	 * and `scopedGeojson` (fit bounds) never see a focus whose ancestors aren't expanded yet (MapLibre's
	 * camera would fit to a degenerate empty bbox and never recover). */
	async function handleFeatureClick(properties: Record<string, unknown>) {
		if (wahlkreisActive) {
			selectedWahlkreis = {
				ref: String(properties.ref ?? ''),
				name: String(properties.name ?? '')
			};
			return;
		}
		const grain = properties.__grain as MapLevel | undefined;
		if (!grain) return;

		// A kreisfreie Stadt's Kreis and its single Gemeinde are the exact same polygon — skip straight
		// to Gemeinde level on a Kreis-grain click instead of requiring a second, visually no-op click to
		// reach the identically-shaped Gemeinde view. The Kreis level still gets recorded in `expanded`
		// (unfocused) purely so the existing mosaic-building effect's per-grain exclusion logic — keyed
		// off `expanded`'s levels — keeps swapping this Kreis's shape for its Gemeinde child unmodified.
		if (grain === 'Kreis' && KREISFREIE_STADT_RS.has(Number(properties.rs))) {
			const rs = Number(properties.rs);
			const name = String(properties.name ?? '');
			const gemeindeEntry: PathEntry = { level: 'Gemeinde', rs, name };
			const toAdd: PathEntry[] = [];
			if (!expanded.some((n) => n.level === 'Kreis' && n.rs === rs)) {
				toAdd.push({ level: 'Kreis', rs, name });
			}
			if (hasKids('Gemeinde', rs) && !expanded.some((n) => n.level === 'Gemeinde' && n.rs === rs)) {
				toAdd.push(gemeindeEntry);
			}
			const ancestors = await missingAncestors({ level: 'Kreis', rs, name });
			focused = gemeindeEntry;
			if (ancestors.length > 0 || toAdd.length > 0)
				expanded = [...expanded, ...ancestors, ...toAdd];
			hoveredProps = undefined;
			return;
		}

		const entry: PathEntry =
			grain === 'Wahlbezirk'
				? {
						level: 'Wahlbezirk',
						rs: Number(properties.gemeinde ?? STUTTGART_RS),
						stationKey: String(properties.AWBEZ_T ?? ''),
						name: String(properties.name ?? '')
					}
				: { level: grain, rs: Number(properties.rs), name: String(properties.name ?? '') };
		const toAdd: PathEntry[] =
			hasKids(entry.level, entry.rs) &&
			!expanded.some((n) => n.level === entry.level && n.rs === entry.rs)
				? [entry]
				: [];
		const ancestors = await missingAncestors(entry);
		focused = entry;
		if (ancestors.length > 0 || toAdd.length > 0) expanded = [...expanded, ...ancestors, ...toAdd];
		hoveredProps = undefined;
	}
	/** Whether `node` sits strictly below `ancestor` in the drill hierarchy (not `ancestor` itself) —
	 * used by `collapseTo` to prune deeper expansions when navigating back up, without touching
	 * `ancestor`'s own expansion or any independent sibling branch. */
	function isStrictDescendantOf(node: PathEntry, ancestor: PathEntry): boolean {
		let current = node;
		while (current.level !== 'Land') {
			const pLevel = parentLevelOf(current.level);
			const pRs = pLevel === 'Land' ? null : parentRsOf(current);
			if (pLevel === ancestor.level && pRs === ancestor.rs) return true;
			if (pLevel === 'Land') break;
			current = { level: pLevel, rs: pRs, name: '' };
		}
		return false;
	}
	/** Navigating back up to `entry` (via a breadcrumb or the "up" button) re-collapses whatever was
	 * drilled into *below* it — e.g. going from a Gemeinde back up to its Regierungsbezirk collapses
	 * that Kreis's Gemeinde-level expansion too, since the Kreis is no longer the focus. Independent
	 * sibling branches (other expanded regions elsewhere in the mosaic) are untouched — only `entry`'s
	 * own descendants are pruned from `expanded`; `entry` itself stays expanded so it keeps showing its
	 * own children. */
	function collapseTo(entry: PathEntry) {
		focused = entry;
		expanded = expanded.filter((n) => !isStrictDescendantOf(n, entry));
		hoveredProps = undefined;
	}
	function goUp() {
		if (panelParentEntry) collapseTo(panelParentEntry);
	}
	/** `index` into `focusedChain`/`crumbs` (Land first, current focus last) — matches BreadcrumbPill's
	 * contract of clicking one of the rendered crumbs. */
	function goTo(index: number) {
		const entry = focusedChain[index];
		if (entry) collapseTo(entry);
	}
	function resetView() {
		expanded = [];
		focused = LAND_ROOT;
		wahlkreisActive = false;
		selectedWahlkreis = null;
		baseLevel = 'Regierungsbezirk';
		hoveredProps = undefined;
	}

	const EBENE_LEVELS: MapLevel[] = ['Regierungsbezirk', 'Kreis', 'Gemeinde'];
	/** `'Wahlkreis'` is a value the Ebene select can take alongside the three real `MapLevel`s — it has
	 * no place in the rs hierarchy (see `wahlkreisActive` below), so it's handled as a string literal
	 * here rather than added to `MapLevel` itself. */
	function onEbeneChange(value: string) {
		selectedWahlkreis = null;
		if (value === 'Wahlkreis') {
			// The left panel keeps showing the rs-hierarchy scope until a Wahlkreis is clicked (see
			// `selectedWahlkreis`) — Wahlkreis only swaps the map's geometry/colouring, not the drill state (`expanded`/`focused`
			// are left untouched, matching the previous standalone toggle's behaviour).
			wahlkreisActive = true;
			hoveredProps = undefined;
			return;
		}
		if (value !== 'Regierungsbezirk' && value !== 'Kreis' && value !== 'Gemeinde') return;
		expanded = [];
		focused = LAND_ROOT;
		baseLevel = value;
		wahlkreisActive = false;
		hoveredProps = undefined;
	}

	// Wahlkreis is an electoral-district view with no place in the rs hierarchy above — reachable only
	// for Bundestags-/Landtagswahl, as one of the Ebene select's options (see `ebeneOptions`) rather
	// than a separate toggle (confirmed with the user).
	let wahlkreisActive = $state(shared.ebene === 'Wahlkreis' && isBundestagOrLandtag);
	/** The clicked Wahlkreis (keyed by `ref`), shown in the left panel instead of `focused` while the
	 * Wahlkreis view is active. Kept apart from `focused`/`expanded` since a Wahlkreis isn't part of
	 * the rs hierarchy; cleared whenever the election, Ebene or view is reset (refs differ between
	 * Bundestag and Landtag). */
	let selectedWahlkreis = $state<{ ref: string; name: string } | null>(null);
	const panelWk = $derived(wahlkreisActive ? selectedWahlkreis : null);

	// ---- Shareable links ----------------------------------------------------------------------

	/** Rebuilds a shared link's focused region (`gebiet`/`wb`/`wk`) the same way clicking down to it
	 * would: every ancestor with children expanded, the region itself focused. Region names come from
	 * the geo files; a link naming a region that doesn't exist is just ignored. */
	async function restoreSharedFocus() {
		if (wahlkreisActive) {
			if (!shared.wk) return;
			const geo = await loadGeo(
				selectedElectionType === 3 ? GEO_URL.wahlkreisLandtag : GEO_URL.wahlkreisBundestag
			);
			const f = geo.features.find((f) => String(f.properties?.ref) === shared.wk);
			if (f) selectedWahlkreis = { ref: shared.wk, name: String(f.properties?.name ?? '') };
			return;
		}
		if (shared.gebiet) await focusRs(shared.gebiet, shared.wb);
	}

	/** Drills the map to `rs` (a Regierungsbezirk, Kreis or Gemeinde) exactly like clicking down to it
	 * — optionally on to one of its Wahlbezirke (`wb` = AWBEZ_T). Used by the shared-link restore and
	 * the search box. */
	async function focusRs(rs: number, wb?: string) {
		const level = levelOfRs(rs);
		if (!level) return;
		const [rbGeo, kreisGeo, gemeindeGeo] = await Promise.all([
			loadGeo(GEO_URL.regierungsbezirk),
			loadGeo(GEO_URL.kreis),
			loadGeo(GEO_URL.gemeinde)
		]);
		const nameIn = (geo: FeatureCollection, key: number) => {
			const name = geo.features.find((f) => Number(f.properties?.rs) === key)?.properties?.name;
			return name == null ? null : String(name);
		};
		const rbRs = Number(rsPrefix(rs, 2).padEnd(11, '0'));
		const kreisRs = Number(rsPrefix(rs, 4).padEnd(11, '0'));
		const chain: PathEntry[] = [];
		const add = (lvl: MapLevel, key: number, name: string | null) => {
			if (name === null) return false;
			chain.push({ level: lvl, rs: key, name });
			return true;
		};
		if (!add('Regierungsbezirk', rbRs, nameIn(rbGeo, rbRs))) return;
		if (level !== 'Regierungsbezirk' && !add('Kreis', kreisRs, nameIn(kreisGeo, kreisRs))) return;
		if (level === 'Gemeinde' && !add('Gemeinde', rs, nameIn(gemeindeGeo, rs))) return;

		let focus = chain[chain.length - 1];
		const wbUrl = wb && bezirkGemeinden.has(rs) ? wahlbezirkeUrl(selectedDate) : null;
		if (wbUrl) {
			const f = (await loadGeo(wbUrl)).features.find((f) => f.properties?.AWBEZ_T === wb);
			if (f) {
				const name = String(f.properties?.name ?? '');
				focus = { level: 'Wahlbezirk', rs, stationKey: wb, name };
			}
		}
		// A place lives in the rs hierarchy, so leave the Wahlkreis view (a no-op on URL restore, which
		// only gets here without one).
		wahlkreisActive = false;
		selectedWahlkreis = null;
		hoveredProps = undefined;
		expanded = chain.filter((e) => hasKids(e.level, e.rs));
		focused = focus;
	}

	// ---- Search ---------------------------------------------------------------------------------

	/** Every Regierungsbezirk, Kreis and Gemeinde by name, for the search box — built once from the
	 * geo files (cached by loadGeo, and loaded by the map anyway). */
	let searchablePlaces = $state<Place[]>([]);
	/** Every Gemeinde's geometry by rs — Punkte scatters its dots in these. Set once, never mutated. */
	let gemeindeFeatures = $state.raw<ReadonlyMap<number, Feature> | null>(null);
	onMount(() => {
		Promise.all([
			loadGeo(GEO_URL.regierungsbezirk),
			loadGeo(GEO_URL.kreis),
			loadGeo(GEO_URL.gemeinde)
		]).then(([rbGeo, kreisGeo, gemeindeGeo]) => {
			gemeindeFeatures = new Map(gemeindeGeo.features.map((f) => [Number(f.properties?.rs), f]));
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local lookup, built and consumed within this callback
			const names = new Map<number, string>();
			for (const geo of [rbGeo, kreisGeo, gemeindeGeo])
				for (const f of geo.features)
					names.set(Number(f.properties?.rs), String(f.properties?.name));
			const nameOf = (rs: number, digits: 2 | 4) =>
				names.get(Number(rsPrefix(rs, digits).padEnd(11, '0'))) ?? '';
			// One entry per rs: a kreisfreie Stadt is in both kreis.json and gemeinde.json, and — like a
			// map click — is focused as its Gemeinde (see levelOfRs).
			searchablePlaces = [...names].flatMap(([rs, name]): Place[] => {
				const level = levelOfRs(rs);
				if (!level) return [];
				const parent =
					level === 'Regierungsbezirk'
						? LAND_ROOT.name
						: level === 'Kreis' || KREISFREIE_STADT_RS.has(rs)
							? nameOf(rs, 2)
							: nameOf(rs, 4);
				return [{ rs, name, level, parent }];
			});
		});
	});
	function findPlaces(q: string): SearchHit[] {
		return searchPlaces(searchablePlaces, q, 6).map((p) => ({
			id: `p-${p.rs}`,
			primary: p.name,
			secondary: `${levelSingular(p.level)} · ${p.parent}`,
			pick: () => void focusRs(p.rs)
		}));
	}
	async function findPeople(q: string): Promise<SearchHit[]> {
		const hits = await client.query.searchCandidates({
			__args: { q },
			name: true,
			party: true,
			rs: true,
			electionType: true,
			date: true
		});
		const placeName = (rs: number) => searchablePlaces.find((p) => p.rs === rs)?.name ?? '';
		return (hits as unknown as CandidateHit[]).map((h, i) => {
			const rs = Number(h.rs);
			const election = data.electionTypes.find((t) => t.electionType === h.electionType);
			return {
				id: `c-${h.rs}-${i}`,
				primary: h.name,
				secondary: [
					h.party,
					placeName(rs),
					`${election?.electionDescription ?? ''} ${h.date.slice(0, 4)}`
				]
					.filter(Boolean)
					.join(' · '),
				// An elected candidate belongs to one election — switch to it, then jump to the Gemeinde.
				pick: () => {
					if (selectedElectionType !== h.electionType) onElectionChange(String(h.electionType));
					selectedDate = h.date;
					void focusRs(rs);
				}
			};
		});
	}

	/** Only start writing the URL once the shared focus is restored — otherwise the first write would
	 * replace the incoming link's `gebiet` with the not-yet-restored Land root. */
	let urlSyncReady = $state(false);
	onMount(() => {
		restoreSharedFocus()
			.catch(() => {})
			.finally(() => (urlSyncReady = true));
	});

	$effect(() => {
		if (!urlSyncReady) return;
		const qs = writeShareParams({
			wahl: selectedElectionType || undefined,
			datum: selectedDate || undefined,
			stimme: hasTwoVotes && !splitting ? selectedVoteType : undefined,
			modus: selectedVisualMode,
			vergleich: changing ? selectedCompareDate || undefined : undefined,
			werte: absoluteValues ? 'absolut' : undefined,
			partei: usesParty ? selectedParty || undefined : undefined,
			ebene: wahlkreisActive
				? 'Wahlkreis'
				: baseLevel !== 'Regierungsbezirk'
					? (baseLevel as ShareEbene)
					: undefined,
			gebiet: !wahlkreisActive && focused.rs !== null ? focused.rs : undefined,
			wb: !wahlkreisActive && focused.level === 'Wahlbezirk' ? focused.stationKey : undefined,
			wk: panelWk?.ref
		});
		untrack(() => {
			const search = qs ? `?${qs}` : '';
			if (search !== page.url.search)
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- path IS resolve('/'); the rule just can't see through the appended query string
				replaceState(`${resolve('/')}${search}`, page.state);
		});
	});

	function levelSingular(level: MapLevel): string {
		switch (level) {
			case 'Land':
				return m.map_level_land();
			case 'Regierungsbezirk':
				return m.map_mode_regierungsbezirk();
			case 'Kreis':
				return m.map_mode_kreis();
			case 'Gemeinde':
				return m.map_mode_gemeinde();
			case 'Wahlbezirk':
				return m.map_mode_wahlbezirk();
		}
	}
	function levelPlural(level: MapLevel): string {
		switch (level) {
			case 'Land':
				return m.map_level_plural_land();
			case 'Regierungsbezirk':
				return m.map_level_plural_regierungsbezirk();
			case 'Kreis':
				return m.map_level_plural_kreis();
			case 'Gemeinde':
				return m.map_level_plural_gemeinde();
			case 'Wahlbezirk':
				return m.map_level_plural_wahlbezirk();
		}
	}
	// Only Regierungsbezirk/Kreis/Gemeinde are offered as hierarchical jump targets — Wahlbezirk data
	// only exists for a few cities (see wahlbezirkGemeinden), so a state-wide "show every Wahlbezirk"
	// view wouldn't be coherent (reached normally, by drilling into one of them, the select just shows
	// nothing matching). Wahlkreis is appended as a further option, only for Bundestags-/Landtagswahl.
	const ebeneOptions = $derived<SelectOption[]>([
		...EBENE_LEVELS.map((lvl) => ({ value: lvl, label: levelSingular(lvl) })),
		...(isBundestagOrLandtag ? [{ value: 'Wahlkreis', label: m.map_mode_wahlkreis() }] : [])
	]);
	// The Ebene is the coarsest grain on the map (see `baseLevel`), not the focused region's level.
	const selectedEbeneValue = $derived(wahlkreisActive ? 'Wahlkreis' : baseLevel);

	// ---- Geometry loading ----------------------------------------------------------------------

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain imperative cache, never read reactively/from the template
	const geoCache = new Map<string, FeatureCollection>();
	async function loadGeo(url: string): Promise<FeatureCollection> {
		const cached = geoCache.get(url);
		if (cached) return cached;
		const geo = (await fetch(url).then((r) => r.json())) as FeatureCollection;
		geoCache.set(url, geo);
		return geo;
	}

	/** Tags a feature with which grain it came from — a clicked feature's `__grain` property is what
	 * lets `handleFeatureClick` above resolve a click on *any* rendered region, not just the current
	 * scope's own children (see the mosaic built below). */
	/** The Gemeinde a Wahlbezirk feature belongs to (Stuttgart's own files carry none). */
	const gemeindeOf = (f: Feature) => Number(f.properties?.gemeinde ?? STUTTGART_RS);

	function tagGrain(f: Feature, grain: MapLevel): Feature {
		return { ...f, properties: { ...f.properties, __grain: grain } };
	}

	// `displayGeojson` is a *mosaic*, built from every independently `expanded` region: start from the
	// whole state at Regierungsbezirk grain, and for each expanded node, swap its own shape for its
	// children at the next finer grain, with their own real data (not dimmed placeholders) — e.g.
	// expanding Karlsruhe *and* Stuttgart shows both subdivided into their Kreise at once, while
	// Freiburg/Tübingen stay whole. Nodes can only ever be expanded via a click on something already
	// rendered (see `handleFeatureClick`), so an expanded Kreis's parent Regierungsbezirk is always
	// itself already expanded too.
	let displayGeojson = $state<FeatureCollection>({ type: 'FeatureCollection', features: [] });
	let sourceKey = $state('');
	let keyProperty = $state('rs');

	$effect(() => {
		const wk = wahlkreisActive;
		const et = selectedElectionType;
		const date = selectedDate;
		const base = baseLevel;
		const exp = expanded;
		const elig = eligibleGemeindeRs;
		const bezirkCities = bezirkGemeinden;

		if (wk) {
			const url = et === 3 ? GEO_URL.wahlkreisLandtag : GEO_URL.wahlkreisBundestag;
			loadGeo(url).then((geo) => {
				displayGeojson = geo;
				keyProperty = 'ref';
				sourceKey = `wahlkreis:${et}`;
			});
			return;
		}

		const rbExpansions = exp.filter((n) => n.level === 'Regierungsbezirk');
		const kreisExpansions = exp.filter((n) => n.level === 'Kreis');
		// Gemeinden drilled into their Wahlbezirke.
		const bezirkExpanded = new Set(
			exp.flatMap((n) =>
				n.level === 'Gemeinde' && n.rs !== null && bezirkCities.has(n.rs) ? [n.rs] : []
			)
		);
		const wbUrl = bezirkExpanded.size > 0 ? wahlbezirkeUrl(date) : null;

		// Which grains appear at all: everything at `base`, plus the children of expanded regions.
		const showKreise = base === 'Kreis' || (base === 'Regierungsbezirk' && rbExpansions.length > 0);
		const showGemeinden = base === 'Gemeinde' || (showKreise && kreisExpansions.length > 0);

		Promise.all([
			base === 'Regierungsbezirk' ? loadGeo(GEO_URL.regierungsbezirk) : null,
			showKreise ? loadGeo(GEO_URL.kreis) : null,
			showGemeinden ? loadGeo(GEO_URL.gemeinde) : null,
			wbUrl ? loadGeo(wbUrl) : null
		]).then(([rbGeo, kreisGeo, gemeindeGeo, wbGeo]) => {
			const combined: Feature[] = [];

			const expandedRbPrefixes = new Set(rbExpansions.map((n) => rsPrefix(n.rs!, 2)));
			const expandedKreisPrefixes = new Set(kreisExpansions.map((n) => rsPrefix(n.rs!, 4)));

			if (rbGeo) {
				combined.push(
					...rbGeo.features
						.filter((f) => !expandedRbPrefixes.has(rsPrefix(Number(f.properties?.rs), 2)))
						.map((f) => tagGrain(f, 'Regierungsbezirk'))
				);
			}

			if (kreisGeo) {
				combined.push(
					...kreisGeo.features
						.filter((f) => {
							const rs = Number(f.properties?.rs);
							return (
								(base === 'Kreis' || expandedRbPrefixes.has(rsPrefix(rs, 2))) &&
								!expandedKreisPrefixes.has(rsPrefix(rs, 4))
							);
						})
						.map((f) => tagGrain(f, 'Kreis'))
				);
			}

			if (gemeindeGeo) {
				combined.push(
					...gemeindeGeo.features
						.filter((f) => {
							const rs = Number(f.properties?.rs);
							return (
								(base === 'Gemeinde' || expandedKreisPrefixes.has(rsPrefix(rs, 4))) &&
								!bezirkExpanded.has(rs) &&
								// Regionalwahl only covers Region Stuttgart — see `elig`'s doc comment above.
								(elig === null || elig.has(rs))
							);
						})
						.map((f) => tagGrain(f, 'Gemeinde'))
				);
			}

			if (wbGeo) {
				combined.push(
					...wbGeo.features
						.filter((f) => bezirkExpanded.has(gemeindeOf(f)))
						.map((f) => tagGrain(f, 'Wahlbezirk'))
						// Synthetic `rs`, so Wahlbezirk features can share the same rs-keyed source as
						// everything else instead of needing MapView to juggle a second keyProperty.
						.map((f) => ({
							...f,
							properties: {
								...f.properties,
								rs: String(f.properties?.AWBEZ_T ?? ''),
								// Map label only: in Stuttgart's own files many Bezirke share a Stadtbezirk
								// name (e.g. "Möhringen"); komm.one's names already start with the number.
								label:
									f.properties?.gemeinde === undefined
										? `${f.properties?.name ?? ''} ${f.properties?.AWBEZ_T ?? ''}`
										: String(f.properties?.name ?? '')
							}
						}))
				);
			}

			displayGeojson = { type: 'FeatureCollection', features: combined };
			keyProperty = 'rs';
			sourceKey = `mosaic:${base}:${exp.map((n) => `${n.level}${n.rs}`).join(',')}`;
		});
	});

	/** The finest layer for whatever's currently focused — its children if it has any (already part
	 * of the mosaic above, since focusing something with children always expands it too — see
	 * `handleFeatureClick`), or just itself if it's a leaf. Drives the camera fit and the panel's own
	 * region count; labels use the full mosaic instead (see the MapView props below) since multiple
	 * branches can be expanded at once now. */
	const scopedGeojson = $derived.by((): FeatureCollection => {
		if (wahlkreisActive || focused.level === 'Land') return displayGeojson;
		if (!hasKids(focused.level, focused.rs)) {
			if (focused.level === 'Wahlbezirk') {
				return {
					type: 'FeatureCollection',
					features: displayGeojson.features.filter(
						(f) =>
							f.properties?.__grain === 'Wahlbezirk' && f.properties?.AWBEZ_T === focused.stationKey
					)
				};
			}
			return {
				type: 'FeatureCollection',
				features: displayGeojson.features.filter(
					(f) => f.properties?.__grain === 'Gemeinde' && Number(f.properties?.rs) === focused.rs
				)
			};
		}
		if (focused.level === 'Gemeinde') {
			// A Gemeinde with Wahlbezirke, expanded — its Wahlbezirke.
			return {
				type: 'FeatureCollection',
				features: displayGeojson.features.filter(
					(f) => f.properties?.__grain === 'Wahlbezirk' && gemeindeOf(f) === focused.rs
				)
			};
		}
		const childGrain = displayLevel;
		const prefixLen = focused.level === 'Regierungsbezirk' ? 2 : 4;
		const prefix = rsPrefix(focused.rs!, prefixLen);
		return {
			type: 'FeatureCollection',
			features: displayGeojson.features.filter(
				(f) =>
					f.properties?.__grain === childGrain &&
					rsPrefix(Number(f.properties?.rs), prefixLen) === prefix
			)
		};
	});
	const fitGeojson = $derived(scopedGeojson);

	/** Every Regierungsbezirk's rs, loaded once — independent of `expanded`/`displayGeojson`, since the
	 * Land-wide sum below needs all four regardless of which (if any) are currently expanded elsewhere
	 * in the mosaic. */
	let allRbRs = $state<number[]>([]);
	$effect(() => {
		loadGeo(GEO_URL.regierungsbezirk).then((geo) => {
			allRbRs = geo.features.map((f) => Number(f.properties?.rs));
		});
	});

	/** Which map-mode grains are actually rendered right now — every grain any expanded region's
	 * children appear at, plus the base Regierungsbezirk layer. Colouring and breakdown data both need
	 * to cover every one of them, not just whichever is focused, since independently expanded siblings
	 * (see `expanded`) are real, hoverable/clickable regions of their own. Ordered coarsest to finest. */
	const grainsNeeded = $derived.by((): MapMode[] => {
		if (wahlkreisActive) return ['Wahlkreis'];
		const grains: MapMode[] = [];
		if (baseLevel === 'Regierungsbezirk') grains.push('Regierungsbezirk');
		const kreise =
			baseLevel === 'Kreis' ||
			(baseLevel === 'Regierungsbezirk' && expanded.some((n) => n.level === 'Regierungsbezirk'));
		if (kreise) grains.push('Kreis');
		if (baseLevel === 'Gemeinde' || (kreise && expanded.some((n) => n.level === 'Kreis')))
			grains.push('Gemeinde');
		if (expanded.some((n) => n.level === 'Gemeinde' && n.rs !== null && bezirkGemeinden.has(n.rs)))
			grains.push('Wahlbezirk');
		return grains;
	});

	// ---- Map fill colour + legend (depends on the active colouring mode/party) ----------------

	let items = $state<RegionItem[]>([]);
	let legend = $state<{
		type: 'turnout' | 'party' | 'parties' | 'diff';
		min?: number;
		max?: number;
		partyName?: string;
		color?: string;
		entries?: { name: string; color: string }[];
	} | null>(null);

	$effect(() => {
		if (!selectedDate || !selectedElectionType) return;
		// Punkte: areas are outlines only (the dots carry the data, see `dots`) — no fill query.
		if (dotMode) {
			items = [];
			legend = null;
			return;
		}
		if (usesParty && !selectedParty) return;
		const grains = grainsNeeded;
		// Capture every reactive value this query depends on *before* the untrack() below — untrack
		// only needs to cover the client.query(...) call/result, not these reads, and reading them
		// inside untrack would silently stop the effect from re-running when they change.
		const geo = displayGeojson;
		const et = selectedElectionType;
		const date = selectedDate;
		const mapInformation = selectedVisualMode;
		// Veränderung = the same query for this date and the comparison date, compared below: Hochburg
		// for one party's share, or the chosen metric's own mode.
		const metric = changeMetric;
		const serverMode: MapInformationMode = changing
			? (metric ?? 'Hochburg')
			: (mapInformation as MapInformationMode);
		const compareDate = changing ? selectedCompareDate : null;
		if (changing && !compareDate) return;
		const party = usesParty && !metric ? selectedParty : undefined;
		// Stimmensplitting needs both votetypes back, so no filter.
		const voteType = isBundestagOrLandtag && !splitting ? selectedVoteType : undefined;

		// Scope each region-grain query to exactly the rs's currently rendered at that grain, so the
		// Wahlbeteiligung/Hochburg colour scale's min/max — and thus every colour on the map — is
		// recomputed from what's actually on screen whenever the map level changes or a click drills
		// into (or back out of) an area, instead of staying pinned to the statewide extremes for that
		// grain (see MapInformationParams.selectedRsList's doc comment). Wahlkreis/Wahlbezirk have no
		// rs-scoped view (see getMapInformation/getMapInformationPs) and stay unfiltered.
		const perGrain: { mode: MapMode; rsList: string[] | undefined }[] = [];
		for (const mode of grains) {
			// Stuttgart's Wahlbezirke are redrawn for every election, so a same-key comparison across
			// dates would be meaningless — left uncoloured in Veränderung.
			if (changing && mode === 'Wahlbezirk') continue;
			if (mode === 'Wahlkreis' || mode === 'Wahlbezirk') {
				perGrain.push({ mode, rsList: undefined });
				continue;
			}
			const rsList = geo.features
				.filter((f) => f.properties?.__grain === mode)
				.map((f) => String(f.properties?.rs));
			if (rsList.length > 0) perGrain.push({ mode, rsList });
		}
		if (perGrain.length === 0) {
			items = [];
			return;
		}

		// untrack: rumble's client.query(...) resolves with a reactive proxy, not plain data — reading
		// its properties calls Svelte's createSubscriber(), which (if effect tracking is active)
		// subscribes whatever reactive context is current to every future emission of this same query.
		// Under requestPolicy: 'cache-and-network', a *cache hit* resolves synchronously inside the
		// client.query(...) call itself (still inside this effect's tracked scope), and every call also
		// gets a second, later "network" emission — so without untracking both the call and the .then()
		// body, this effect ends up subscribed to its own query and re-triggers itself on that second
		// emission, which re-issues the query, which re-subscribes, forever: hits Svelte's
		// effect_update_depth_exceeded loop guard within a few round-trips. Same fix applied to the
		// parties/breakdown effects. One query per grain the mosaic actually renders — merged, with the
		// *finest* grain's legend winning (mirrors what the panel/hover card focus on).
		const fetchGrains = (d: string) =>
			Promise.all(
				perGrain.map(({ mode, rsList }) =>
					client.query.regionData({
						__args: {
							electionType: et,
							date: d,
							mapMode: mode,
							mapInformation: serverMode,
							party,
							voteType,
							rs: rsList
						},
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
				)
			);
		untrack(() =>
			Promise.all([fetchGrains(date), compareDate ? fetchGrains(compareDate) : null]).then(
				([results, before]) => {
					untrack(() => {
						let rawItems = results.flatMap((r) => r.items) as unknown as RegionItem[];
						const oldItems = before
							? new Map(
									(before.flatMap((r) => r.items) as unknown as RegionItem[]).map((i) => [i.key, i])
								)
							: null;
						if (oldItems && (metric === 'Stärkste Partei' || metric === '2. Stärkste Partei')) {
							// Winner change: pale party colour where the same party led both times; where it
							// changed hands, stripes of the old party (pale) and the new one (full); no colour
							// where either election is missing.
							items = rawItems.map((i) => {
								const old = oldItems.get(i.key);
								const was = old?.partyName;
								const color =
									was == null || !i.color
										? null
										: was === i.partyName
											? paleColor(i.color)
											: i.color;
								const stripe: [string, string] | undefined =
									color && was !== i.partyName && old?.color
										? [paleColor(old.color), color]
										: undefined;
								// partyColor keeps the full colour for the legend swatches.
								return { ...i, color, stripe, partyColor: i.color, notCompeting: color === null };
							});
							legend = results[results.length - 1]?.legend as unknown as typeof legend;
							return;
						}
						if (oldItems) {
							// Veränderung: votePercent becomes the change in points vs. the comparison date (of
							// turnout, or the party's share); areas missing (or without the party) in either
							// election get no comparison, not 0.
							const valueOf = (i: RegionItem | undefined) =>
								(metric === 'Wahlbeteiligung' ? i?.turnoutPercent : i?.votePercent) as
									number | null | undefined;
							rawItems = rawItems.map((i) => {
								const now = valueOf(i);
								const was = valueOf(oldItems.get(i.key));
								const diff = now == null || was == null ? null : now - was;
								return { ...i, votePercent: diff, notCompeting: diff === null };
							});
						}
						// Wahlbeteiligung/Hochburg colour by a continuous min-max scale, and each grain above was
						// queried (and thus scaled) separately server-side — a Gemeinde-grain 39.9 % can end up
						// *lighter* than a Kreis-grain 40.6 % right next to it on the map, because each was
						// coloured against its own grain's local range rather than one shared range for
						// everything actually visible. Recolour the merged set here, against one shared scale
						// built from every grain's raw values together, so two regions with a similar number
						// always render a similar shade regardless of which grain either one came from.
						if (mapInformation === 'Wahlbeteiligung') {
							const values = rawItems
								.map((i) => i.turnoutPercent as number | null | undefined)
								.filter((v): v is number => v != null);
							const scale = turnoutColorScale(values);
							items = rawItems.map((i) => ({
								...i,
								color: i.turnoutPercent == null ? null : (scale(i.turnoutPercent as number) ?? null)
							}));
							legend = values.length
								? { type: 'turnout', min: Math.min(...values), max: Math.max(...values) }
								: null;
						} else if (mapInformation === 'Hochburg') {
							const values = rawItems
								.map((i) => i.votePercent as number | null | undefined)
								.filter((v): v is number => v != null);
							const origColor =
								results
									.map((r) => (r.legend as { color?: string | null } | null)?.color)
									.find((c): c is string => !!c) ?? '#999999';
							const scale = partyColorScale(values, origColor);
							items = rawItems.map((i) => ({
								...i,
								color: i.votePercent == null ? null : (scale(i.votePercent as number) ?? null)
							}));
							legend = values.length
								? {
										type: 'party',
										partyName: party ?? '',
										color: origColor,
										min: Math.min(...values),
										max: Math.max(...values)
									}
								: null;
						} else if (mapInformation === 'Stimmensplitting' || mapInformation === 'Veränderung') {
							// Same shared-scale recolouring as above; votePercent is a difference in points here
							// (Erst − Zweit, or now − comparison date).
							const values = rawItems
								.map((i) => i.votePercent as number | null | undefined)
								.filter((v): v is number => v != null);
							const scale = diffColorScale(values);
							const bound = Math.max(0, ...values.map(Math.abs));
							items = rawItems.map((i) => ({
								...i,
								color: i.votePercent == null ? null : (scale(i.votePercent as number) ?? null)
							}));
							legend = values.length
								? { type: 'diff', partyName: party ?? '', min: -bound, max: bound }
								: null;
						} else {
							// Stärkste/2. Stärkste Partei colour each region by a fixed per-party colour, not a
							// scale, so no cross-grain rescaling is needed here — the finest grain's legend
							// still wins, matching what the panel/hover card focus on.
							items = rawItems;
							legend = results[results.length - 1]?.legend as unknown as typeof legend;
						}
					});
				}
			)
		);
	});

	// ---- Full per-party breakdowns (left panel + hover card) -----------------------------------
	//
	// Fetched once per (scope's children, election, date, voteType) — not per hover — and merged into
	// a cache keyed by rs/districtId/station-slug (matching `keyProperty`). A region's own row lands in
	// the cache the moment it's shown as a *child* of its parent scope, so by the time the user drills
	// into it, its row is already there — no extra round trip. See the plan file's "client-side cache"
	// section for the full rationale.

	const breakdownCache = new SvelteMap<string, RegionBreakdown>();
	/** The "other side" of the two difference modes, compared against `breakdownCache`: Zweitstimme
	 * breakdowns in Stimmensplitting (where `breakdownCache` holds the Erststimme), the comparison
	 * date's in Veränderung. Empty in every other mode. */
	const secondCache = new SvelteMap<string, RegionBreakdown>();
	let lastBreakdownContext = '';

	$effect(() => {
		const grains = grainsNeeded;
		const et = selectedElectionType;
		const date = selectedDate;
		const split = splitting;
		const compareDate = changing ? selectedCompareDate : '';
		const vt = split ? '0' : isBundestagOrLandtag ? selectedVoteType : undefined;
		const geo = displayGeojson;
		const foc = focused;
		if (!date || !et) return;

		const context = `${et}|${date}|${vt ?? ''}|${split}|${compareDate}`;
		if (context !== lastBreakdownContext) {
			breakdownCache.clear();
			secondCache.clear();
			lastBreakdownContext = context;
		}

		// One fetch per grain the mosaic actually renders, each scoped to exactly the rs's shown at
		// that grain — plus each such node's own rs where it's `focused` (deliberately excluded from
		// its own sibling layer, see the geometry effect above, but still needed for the panel).
		// Wahlkreis/Wahlbezirk are always fetched unfiltered server-side regardless of rsList (see
		// getRegionBreakdowns) and Wahlkreis features aren't tagged with `__grain` at all (that branch
		// bypasses the mosaic entirely), so neither needs one computed here.
		const perGrain: { mode: MapMode; rsList: string[] | undefined }[] = [];
		for (const mode of grains) {
			if (mode === 'Wahlkreis' || mode === 'Wahlbezirk') {
				perGrain.push({ mode, rsList: undefined });
				continue;
			}
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local accumulator, built and consumed entirely within this one effect run
			const rsSet = new Set(
				geo.features
					.filter((f) => f.properties?.__grain === mode)
					.map((f) => String(f.properties?.rs))
			);
			// Every expanded node's own rs is deliberately excluded from its own sibling layer (see the
			// geometry effect above) but its data is still needed — for its own panel visit, and for the
			// Land-wide sum, which needs *all four* Regierungsbezirke regardless of which is focused.
			for (const n of expanded) if (n.level === mode && n.rs !== null) rsSet.add(String(n.rs));
			if (foc.level === mode && foc.rs !== null) rsSet.add(String(foc.rs));
			if (rsSet.size > 0) perGrain.push({ mode, rsList: [...rsSet] });
		}
		// The Land panel sums all four Regierungsbezirke (see `landBreakdown`) — fetch them even when
		// the map doesn't render that grain (flat Kreis/Gemeinde view, Wahlkreis view), or the panel
		// goes empty once a vote-type/date change clears the cache.
		if (foc.level === 'Land' && allRbRs.length > 0) {
			const rb = perGrain.find((p) => p.mode === 'Regierungsbezirk');
			const rbList = allRbRs.map(String);
			if (rb) rb.rsList = [...new Set([...(rb.rsList ?? []), ...rbList])];
			else perGrain.push({ mode: 'Regierungsbezirk', rsList: rbList });
		}
		// Punkte scatters dots per Gemeinde across the whole scope, whatever grain is drawn.
		const dotRs = dotScopeRs;
		if (dotRs.length > 0) {
			const gem = perGrain.find((p) => p.mode === 'Gemeinde');
			const list = dotRs.map(String);
			if (gem) gem.rsList = [...new Set([...(gem.rsList ?? []), ...list])];
			else perGrain.push({ mode: 'Gemeinde', rsList: list });
		}
		if (perGrain.length === 0) return;

		const fetchInto = (
			cache: SvelteMap<string, RegionBreakdown>,
			d: string,
			voteType: typeof vt,
			grainsToFetch = perGrain
		) =>
			Promise.all(
				grainsToFetch.map(({ mode, rsList }) =>
					client.query.regionBreakdowns({
						__args: { electionType: et, date: d, mapMode: mode, rs: rsList, voteType },
						key: true,
						turnout: true,
						eligible: true,
						seatTotal: true,
						postalElsewhere: true,
						rows: {
							partyName: true,
							color: true,
							votePercent: true,
							voteCount: true,
							seats: true,
							candidate: true
						}
					})
				)
			).then((results) => {
				untrack(() => {
					for (const list of results)
						for (const b of list as unknown as RegionBreakdown[]) cache.set(b.key, b);
				});
			});
		untrack(() => {
			fetchInto(breakdownCache, date, vt);
			if (split) fetchInto(secondCache, date, '1');
			// Wahlbezirke aren't comparable across dates (see the map-colour effect), so no compare data.
			if (compareDate)
				fetchInto(
					secondCache,
					compareDate,
					vt,
					perGrain.filter((p) => p.mode !== 'Wahlbezirk')
				);
		});
	});

	/** Weighted sum of several regions' breakdowns into one combined total — used for the Land scope,
	 * which has no row of its own in the aggregate tables (see getRegionBreakdowns' doc comment).
	 * Vote shares are recomputed from summed raw vote counts (not averaged percentages) and turnout is
	 * eligible-voter-weighted — both necessary since the four Regierungsbezirke differ hugely in size. */
	function sumBreakdowns(list: RegionBreakdown[]): RegionBreakdown {
		let eligibleSum = 0;
		let votersWeighted = 0;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local accumulator, built and consumed entirely within this one call
		const partyTotals = new Map<string, { color: string | null; voteCount: number }>();
		for (const b of list) {
			if (b.eligible != null) {
				eligibleSum += b.eligible;
				if (b.turnout != null) votersWeighted += (b.turnout / 100) * b.eligible;
			}
			for (const r of b.rows) {
				if (!r.partyName) continue;
				const cur = partyTotals.get(r.partyName) ?? { color: r.color, voteCount: 0 };
				cur.voteCount += r.voteCount ?? 0;
				if (!cur.color) cur.color = r.color;
				partyTotals.set(r.partyName, cur);
			}
		}
		const totalVotes = Array.from(partyTotals.values()).reduce((s, p) => s + p.voteCount, 0);
		const rows = Array.from(partyTotals, ([partyName, p]) => ({
			partyName,
			color: p.color,
			voteCount: p.voteCount,
			votePercent: totalVotes > 0 ? (p.voteCount / totalVotes) * 100 : null,
			seats: null
		})).sort((a, b) => (b.votePercent ?? -Infinity) - (a.votePercent ?? -Infinity));
		return {
			key: 'LAND',
			turnout: eligibleSum > 0 ? (votersWeighted / eligibleSum) * 100 : null,
			eligible: eligibleSum || null,
			seatTotal: null, // no election in this app allocates seats state-wide
			rows
		};
	}

	function landSum(cache: SvelteMap<string, RegionBreakdown>) {
		if (focused.level !== 'Land') return null;
		// All four Regierungsbezirke, not just whichever `scopedGeojson` currently renders whole — some
		// may be excluded from that layer because they're independently expanded elsewhere in the
		// mosaic, but the Land-wide sum still needs every one of them (see the breakdown-fetch effect
		// above, which fetches each expanded node's own rs regardless of focus for exactly this).
		const rows = allRbRs
			.map((rs) => cache.get(String(rs)))
			.filter((b): b is RegionBreakdown => !!b);
		return rows.length ? sumBreakdowns(rows) : null;
	}
	const landBreakdown = $derived(landSum(breakdownCache));

	// ---- Punkte (dot density) -------------------------------------------------------------------

	/** Gemeinden whose votes become dots: all of them inside the focused area (the whole Land for
	 * Land focus, flat views and the Wahlkreis view), or just the focused Gemeinde. */
	const dotScopeRs = $derived.by((): number[] => {
		if (!dotMode || !allGemeindeRs) return [];
		const f = focused;
		if (f.rs !== null && !wahlkreisActive && (f.level === 'Gemeinde' || f.level === 'Wahlbezirk'))
			return [f.rs];
		const prefix =
			f.rs === null || wahlkreisActive
				? ''
				: rsPrefix(f.rs, f.level === 'Regierungsbezirk' ? 2 : 4);
		return allGemeindeRs.filter(
			(rs) => !NO_ELECTION_RS.has(rs) && rsPrefix(rs, 4).startsWith(prefix)
		);
	});
	/** Dots for every Gemeinde in scope (or, once one is drilled into, its drawn Wahlbezirke),
	 * one per `perDot` votes; `perDot` is picked from the total so the map shows ~20–50k dots. */
	const dotData = $derived.by(() => {
		if (!dotMode || !gemeindeFeatures) return null;
		const wbFeatures = displayGeojson.features.filter(
			(f) => f.properties?.__grain === 'Wahlbezirk'
		);
		const drawnAsBezirke = new Set(wbFeatures.map(gemeindeOf));
		const places = [
			...dotScopeRs
				.filter((rs) => !drawnAsBezirke.has(rs))
				.map((rs) => ({ key: String(rs), feature: gemeindeFeatures!.get(rs) })),
			...wbFeatures.map((f) => ({ key: String(f.properties?.rs), feature: f }))
		];
		const areas: DotArea[] = places.flatMap(({ key, feature }) => {
			const b = breakdownCache.get(key);
			if (!b || !feature) return [];
			const parties = b.rows
				.filter((r) => r.partyName && (r.voteCount ?? 0) > 0)
				.map((r) => ({ name: r.partyName!, color: r.color ?? '#cfc8ba', votes: r.voteCount! }));
			return [{ key, feature: feature as DotArea['feature'], parties }];
		});
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local accumulator, built and consumed within this derivation
		const totals = new Map<string, { color: string; votes: number }>();
		for (const a of areas)
			for (const p of a.parties) {
				const t = totals.get(p.name) ?? { color: p.color, votes: 0 };
				t.votes += p.votes;
				totals.set(p.name, t);
			}
		const total = [...totals.values()].reduce((s, t) => s + t.votes, 0);
		if (total === 0) return null;
		const perDot = niceDotValue(total);
		const entries = [...totals]
			.sort((a, b) => b[1].votes - a[1].votes)
			.slice(0, 8)
			.map(([name, t]) => ({ name, color: t.color }));
		return { dots: makeDots(areas, perDot), perDot, entries };
	});

	const panelKey = $derived(
		focused.level === 'Wahlbezirk' ? (focused.stationKey ?? '') : String(focused.rs)
	);
	const panelBreakdown = $derived(
		panelWk
			? breakdownCache.get(panelWk.ref)
			: focused.rs === null
				? landBreakdown
				: breakdownCache.get(panelKey)
	);
	// ---- Bundestag/Landtag mandates per Wahlkreis (official, see server/map/mandates.ts) ----------

	type Mandates = {
		direct: { name: string | null; party: string; percent: number | null; seat: boolean } | null;
		list: { name: string; party: string; listPlace: number | null }[];
		/** The Gemeinden (rs) the Wahlkreis covers. */
		rs: string[];
		/** Wahlbezirke in it of Gemeinden spanning several Wahlkreise ("001-01"). */
		bezirke: string[];
	};
	let mandatesByWk = $state<Record<string, Mandates>>({});
	$effect(() => {
		const date = selectedDate;
		const electionType = selectedElectionType;
		mandatesByWk = {};
		if (!isBundestagOrLandtag || !date) return;
		let stale = false;
		// untrack: see the note on the breakdown effect (rumble results are reactive proxies).
		untrack(() =>
			client.query
				.wahlkreisMandates({
					__args: { date, electionType },
					districtId: true,
					direct: { name: true, party: true, percent: true, seat: true },
					list: { name: true, party: true, listPlace: true },
					rs: true,
					bezirke: true
				})
				.then((rows) =>
					untrack(() => {
						if (stale) return;
						mandatesByWk = Object.fromEntries(
							(rows as unknown as (Mandates & { districtId: string })[]).map((r) => [
								r.districtId,
								{
									direct: r.direct,
									list: r.list,
									rs: r.rs,
									bezirke: r.bezirke
								}
							])
						);
					})
				)
		);
		return () => {
			stale = true;
		};
	});
	/** A party's colour from the panel's rows ("Die Linke" in the Bundeswahlleiterin's data vs. our
	 * family name "DIE LINKE"). */
	function partyColor(party: string): string | null {
		const p = party.toLowerCase();
		return panelBreakdown?.rows.find((r) => r.partyName?.toLowerCase() === p)?.color ?? null;
	}
	/** The Wahlkreise whose members the panel shows: the focused Wahlkreis, or those of the focused
	 * Gemeinde (several for Stuttgart, Mannheim, …) or Wahlbezirk. */
	const mandateWks = $derived.by((): string[] => {
		if (panelWk) return [panelWk.ref];
		const f = focused;
		const byRs = (wk: string) => f.rs !== null && mandatesByWk[wk].rs.includes(String(f.rs));
		const byBezirk = (wk: string) =>
			!!f.stationKey && mandatesByWk[wk].bezirke.includes(f.stationKey);
		// A Wahlbezirk of a Gemeinde in a single Wahlkreis is listed by its Gemeinde only.
		const inWk =
			f.level === 'Wahlbezirk'
				? Object.keys(mandatesByWk).some(byBezirk)
					? byBezirk
					: byRs
				: f.level === 'Gemeinde'
					? byRs
					: null;
		return inWk
			? Object.keys(mandatesByWk)
					.filter(inWk)
					.sort((a, b) => Number(a) - Number(b))
			: [];
	});
	const mandateGroups = $derived.by((): PeopleGroup[] => {
		// Landtag until 2021: Erst-/Zweitmandate — Zweitmandate also went to Wahlkreis candidates (no
		// party lists). Since 2026 it has Landeslisten, and its mandates read like the Bundestag's.
		const landtag = selectedElectionType === 3 && !hasTwoVotes;
		const groups: PeopleGroup[] = [];
		for (const wk of mandateWks) {
			const m_ = mandatesByWk[wk];
			if (m_) groups.push(...mandateGroupsOf(m_, landtag, panelWk ? null : wk));
		}
		// Credit the source under the last group (Bundestag: Datenlizenz Deutschland – Namensnennung).
		const last = groups[groups.length - 1];
		const source = landtag
			? m.map_mandate_source_landtag()
			: selectedElectionType === 3
				? m.map_mandate_source_statistik_bw()
				: m.map_mandate_source();
		if (last) last.note = [last.note, source].filter(Boolean).join('\n');
		return groups;
	});
	/** `wk`: set in a Gemeinde's panel, where the titles name the Wahlkreis. */
	function mandateGroupsOf(m_: Mandates, landtag: boolean, wk: string | null): PeopleGroup[] {
		const titled = (title: string) => (wk ? m.map_mandate_title_wk({ title, nr: wk }) : title);
		const groups: PeopleGroup[] = [];
		const d = m_.direct;
		if (d)
			groups.push({
				title: titled(
					landtag
						? m.map_mandate_first()
						: d.seat
							? m.map_mandate_direct()
							: m.map_mandate_winner_no_seat()
				),
				people: [
					{
						name: d.name ?? d.party,
						detail: d.percent === null ? d.party : `${d.party} · ${fmtPct(d.percent)}`,
						color: partyColor(d.party)
					}
				],
				note: d.seat ? null : m.map_mandate_no_seat_note({ party: d.party })
			});
		if (m_.list.length > 0)
			groups.push({
				title: titled(landtag ? m.map_mandate_second() : m.map_mandate_list()),
				people: m_.list.map((l) => ({
					name: l.name,
					detail:
						l.listPlace === null
							? l.party
							: m.map_mandate_list_place({ party: l.party, place: l.listPlace }),
					color: partyColor(l.party)
				}))
			});
		return groups;
	}

	const panelSecond = $derived(
		!splitting && !changing
			? undefined
			: panelWk
				? secondCache.get(panelWk.ref)
				: focused.rs === null
					? landSum(secondCache)
					: secondCache.get(panelKey)
	);

	/** One party's share in `a` and `b` (Erst/Zweit, or now/comparison date) and a − b — null when
	 * either side lacks it (no direct candidate, didn't run, area missing, or not loaded yet). */
	function pairOf(
		a: RegionBreakdown | null | undefined,
		b: RegionBreakdown | null | undefined,
		partyName = selectedParty
	) {
		if (partyName === 'Wahlbeteiligung') {
			if (a?.turnout == null || b?.turnout == null) return null;
			const color = 'var(--map-ink-muted)';
			return {
				a: a.turnout,
				b: b.turnout,
				diff: a.turnout - b.turnout,
				color,
				aVotes: votersOf(a),
				bVotes: votersOf(b)
			};
		}
		const rowA = a?.rows.find((r) => r.partyName === partyName);
		const rowB = b?.rows.find((r) => r.partyName === partyName);
		if (rowA?.votePercent == null || rowB?.votePercent == null) return null;
		return {
			a: rowA.votePercent,
			b: rowB.votePercent,
			diff: rowA.votePercent - rowB.votePercent,
			color: rowA.color,
			aVotes: rowA.voteCount,
			bVotes: rowB.voteCount
		};
	}
	/** Voters (turnout × eligible) — the absolute counterpart of a turnout share. */
	function votersOf(b: RegionBreakdown | null | undefined): number | null {
		return b?.turnout == null || b.eligible == null ? null : (b.turnout / 100) * b.eligible;
	}
	/** Signed vote-count difference, e.g. "+1.234". */
	function fmtVoteDiff(v: number | null | undefined): string {
		return v == null ? '–' : (v > 0 ? '+' : '') + fmtNum(v);
	}
	/** Strongest (rank 0) or second-strongest (rank 1) party of a breakdown — rows are sorted by share. */
	function rankedRow(b: RegionBreakdown | null | undefined, rank: number) {
		return b?.rows[rank]?.votePercent != null ? b.rows[rank] : undefined;
	}
	function fmtDiff(v: number): string {
		return m.map_split_diff_pts({ diff: (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') });
	}
	/** The pair as two bar rows (party colour), shared by hover card and panel: Erst then Zweit, or
	 * chronologically (comparison year, then this year). */
	function pairRows(s: NonNullable<ReturnType<typeof pairOf>>, absolute = false) {
		const rows = changing
			? [
					{ key: 'b', name: compareYear, v: s.b, votes: s.bVotes },
					{ key: 'a', name: selectedDate.slice(0, 4), v: s.a, votes: s.aVotes }
				]
			: [
					{ key: 'a', name: m.map_erststimme(), v: s.a, votes: s.aVotes },
					{ key: 'b', name: m.map_zweitstimme(), v: s.b, votes: s.bVotes }
				];
		return rows.map(({ v, votes, ...r }) => ({
			...r,
			color: s.color,
			pct: absolute ? fmtNum(votes) : fmtPct(v),
			widthPercent: barWidth(v)
		}));
	}

	// Collapses the "Sonstige" (others) expansion whenever the panel starts showing a different region.
	let sonstigeExpanded = $state(false);
	$effect(() => {
		void panelKey;
		sonstigeExpanded = false;
	});

	// ---- Candidates of one list ---------------------------------------------------------------
	// Gemeinderats-/Kreistagswahl in one Gemeinde or Stuttgart Wahlbezirk: clicking a party row lists
	// that list's candidates with their votes there (server/map/queries.ts `getCandidateResults`).

	type Candidate = { name: string; votes: number; elected: boolean };
	const candidatesAvailable = $derived(
		(selectedElectionType === GEMEINDERATSWAHL_TYPE ||
			selectedElectionType === KREISTAGSWAHL_TYPE) &&
			!panelWk &&
			!splitting &&
			(focused.level === 'Gemeinde' || focused.level === 'Wahlbezirk')
	);
	let candidateParty = $state<string | null>(null);
	/** null while loading. */
	let candidates = $state<Candidate[] | null>(null);
	$effect(() => {
		void panelKey;
		void selectedDate;
		void selectedElectionType;
		candidateParty = null;
	});
	$effect(() => {
		const party = candidateParty;
		const rs = focused.rs;
		const station = focused.level === 'Wahlbezirk' ? focused.stationKey : undefined;
		const args = { electionType: selectedElectionType, date: selectedDate, party: party ?? '' };
		candidates = null;
		if (!party || rs === null) return;
		let stale = false;
		// untrack: see the note on the breakdown effect (rumble results are reactive proxies).
		untrack(() =>
			client.query
				.candidateResults({
					__args: { ...args, rs: String(rs), station },
					name: true,
					votes: true,
					elected: true
				})
				.then((rows) =>
					untrack(() => {
						if (!stale)
							candidates = (rows as unknown as Candidate[]).map((c) => ({
								name: c.name,
								votes: c.votes,
								elected: c.elected
							}));
					})
				)
		);
		return () => {
			stale = true;
		};
	});

	// ---- Hover ----------------------------------------------------------------------------------

	let hoveredProps = $state<Record<string, unknown> | undefined>(undefined);
	let hoverPoint = $state<{ x: number; y: number } | null>(null);
	function handleFeatureHover(
		_item: RegionItem | undefined,
		point?: { x: number; y: number },
		properties?: Record<string, unknown>
	) {
		hoveredProps = properties;
		hoverPoint = point ?? null;
	}
	const hoveredKey = $derived(hoveredProps ? String(hoveredProps[keyProperty]) : null);
	const hoverBreakdown = $derived(hoveredKey ? breakdownCache.get(hoveredKey) : undefined);

	function fmtPct(v: number | null | undefined): string {
		return v == null ? '–' : v.toFixed(1).replace('.', ',') + ' %';
	}
	function fmtNum(v: number | null | undefined): string {
		return v == null ? '–' : Math.round(v).toLocaleString('de-DE');
	}
	/** "CDU / Dr. Max Mustermann" — Erststimmen, where only one candidate of the party ran in the
	 * area (the server sets `candidate` only then). */
	function withCandidate(r: RegionBreakdown['rows'][number]): string {
		if (!r.candidate) return r.partyName ?? '';
		// Bundestag/Landtag "Sonstige" holds only independents (every party has its own family), so a
		// single person there ran without a party.
		const party = r.partyName === 'Sonstige' ? m.map_independent_candidate() : r.partyName;
		return `${party ?? ''} / ${r.candidate}`;
	}
	/** `absolute`: vote counts instead of shares (left panel's "Stimmen" setting; the hover card keeps
	 * shares). Bars stay share-based either way — same proportions within one area. */
	/** Bar length in % of the track — true to scale, no minimum (a zero is an empty bar). */
	function barWidth(percent: number): number {
		return Math.max(0, Math.min(100, percent));
	}
	function toRows(b: RegionBreakdown | null | undefined, limit: number | null, absolute = false) {
		if (!b || b.rows.length === 0) return [];
		const max = Math.max(...b.rows.map((r) => r.votePercent ?? 0), 0.0001);
		const rows = limit === null ? b.rows : b.rows.slice(0, limit);
		return rows.map((r) => ({
			key: r.partyName ?? 'unknown',
			color: r.color,
			name: withCandidate(r),
			pct: absolute ? fmtNum(r.voteCount) : fmtPct(r.votePercent),
			seats: r.seats != null ? String(r.seats) : null,
			widthPercent: barWidth(((r.votePercent ?? 0) / max) * 100)
		}));
	}
	/** The one row for the party currently driving the Hochburg colouring — a top-5-by-share list isn't
	 * the point in this mode, the selected party's own number here is. */
	function toSingleRow(b: RegionBreakdown, partyName: string, absolute = false) {
		const row = b.rows.find((r) => r.partyName === partyName);
		if (!row) return [];
		return [
			{
				key: row.partyName ?? 'unknown',
				color: row.color,
				name: withCandidate(row),
				pct: absolute ? fmtNum(row.voteCount) : fmtPct(row.votePercent),
				seats: row.seats != null ? String(row.seats) : null,
				widthPercent: barWidth(row.votePercent ?? 0)
			}
		];
	}

	// The hovered feature carries its own `__grain` (tagged when the mosaic was built) — using that
	// instead of `displayLevel` matters now that siblings at other grains are hoverable too (e.g.
	// hovering one of the other three Regierungsbezirke while `displayLevel` is 'Kreis').
	const hoveredGrain = $derived(
		!wahlkreisActive && hoveredProps
			? ((hoveredProps.__grain as MapLevel | undefined) ?? null)
			: null
	);

	const hoverData = $derived.by(() => {
		if (!hoveredProps) return null;
		const hoveredRs = keyProperty === 'rs' ? Number(hoveredProps.rs) : null;
		// Gemeindefreie Gebiete (Gutsbezirk Münsingen, Rheinau/Rhinau — see NO_ELECTION_RS's doc
		// comment) have no Gemeinderat/Bürgermeister and so never have a breakdown row at all; say so
		// explicitly instead of silently showing no hover card, which otherwise looks indistinguishable
		// from breakdown data just not having loaded yet.
		if (hoveredRs !== null && NO_ELECTION_RS.has(hoveredRs)) {
			return {
				name: String(hoveredProps.label ?? hoveredProps.name ?? ''),
				level: hoveredGrain ? levelSingular(hoveredGrain) : '',
				turnoutLabel: m.map_info_wahlbeteiligung(),
				turnoutValue: '–',
				rows: [],
				hint: m.map_hover_keine_wahl()
			};
		}
		// Kreisfreie Städte have no Landkreis and so never hold a Kreistagswahl of their own — say so
		// explicitly rather than showing the more generic "no data" hint below.
		if (
			selectedElectionType === KREISTAGSWAHL_TYPE &&
			hoveredRs !== null &&
			KREISFREIE_STADT_RS.has(hoveredRs)
		) {
			return {
				name: String(hoveredProps.label ?? hoveredProps.name ?? ''),
				level: hoveredGrain ? levelSingular(hoveredGrain) : '',
				turnoutLabel: m.map_info_wahlbeteiligung(),
				turnoutValue: '–',
				rows: [],
				hint: m.map_hover_keine_kreistagswahl()
			};
		}
		// Anything else rendered but lacking a breakdown genuinely has no data for this election — e.g. a
		// Gemeinde outside the Verband Region Stuttgart during a Regionalwahl (though the geometry above
		// already hides most of those — see `eligibleGemeindeRs` — this still covers whatever grain isn't
		// filtered, like a whole-state Kreis/Regierungsbezirk view). Breakdown data is fetched per grain
		// up front, not per hover, so this isn't a "hasn't loaded yet" false positive in practice.
		if (!hoverBreakdown) {
			return {
				name: String(hoveredProps.label ?? hoveredProps.name ?? hoveredProps.AWBEZ_T ?? ''),
				level: hoveredGrain ? levelSingular(hoveredGrain) : '',
				turnoutLabel: m.map_info_wahlbeteiligung(),
				turnoutValue: '–',
				rows: [],
				hint: m.map_hover_keine_daten()
			};
		}
		const grain = hoveredGrain;
		const canDrillFurther =
			grain !== null && grain !== 'Wahlbezirk' && hoveredRs !== null && hasKids(grain, hoveredRs);
		// The rows shown adapt to what's actually being coloured by: a top-5 party breakdown isn't
		// relevant in Wahlbeteiligung mode (turnout is already the headline stat below), and in
		// Hochburg mode the one party being visualised is what matters, not the overall ranking.
		const rows =
			selectedVisualMode === 'Hochburg'
				? toSingleRow(hoverBreakdown, selectedParty, absoluteValues)
				: selectedVisualMode === 'Wahlbeteiligung'
					? []
					: toRows(hoverBreakdown, 5, absoluteValues);
		const wkDirect = wahlkreisActive ? mandatesByWk[String(hoveredProps.ref)]?.direct : null;
		const drillHint = wahlkreisActive
			? wkDirect?.name
				? selectedElectionType === 3 && !hasTwoVotes
					? m.map_mandate_hover_first({ name: wkDirect.name, party: wkDirect.party })
					: wkDirect.seat
						? m.map_mandate_hover({ name: wkDirect.name, party: wkDirect.party })
						: m.map_mandate_hover_no_seat({ name: wkDirect.name, party: wkDirect.party })
				: ''
			: canDrillFurther
				? m.map_hover_click_opens({ level: levelPlural(childLevel(grain!)!) })
				: m.map_hover_tiefste_ebene();
		const name = String(hoveredProps.label ?? hoveredProps.name ?? hoveredProps.AWBEZ_T ?? '');
		const level = wahlkreisActive ? m.map_mode_wahlkreis() : grain ? levelSingular(grain) : '';
		const noPairHint = splitting
			? m.map_split_no_candidate()
			: grain === 'Wahlbezirk'
				? m.map_change_no_compare_wb()
				: m.map_change_no_compare();
		if (changeMetric === 'Stärkste Partei' || changeMetric === '2. Stärkste Partei') {
			// Winner change: "gewechselt"/"gleich" plus who led then and now.
			const rank = changeMetric === 'Stärkste Partei' ? 0 : 1;
			const was = rankedRow(secondCache.get(hoveredKey!), rank);
			const now = rankedRow(hoverBreakdown, rank);
			const rows =
				was && now
					? [
							{ key: 'b', year: compareYear, r: was },
							{ key: 'a', year: selectedDate.slice(0, 4), r: now }
						].map(({ key, year, r }) => ({
							key,
							color: r.color,
							name: `${year} · ${r.partyName ?? ''}`,
							pct: absoluteValues ? fmtNum(r.voteCount) : fmtPct(r.votePercent),
							widthPercent: barWidth(r.votePercent ?? 0)
						}))
					: [];
			return {
				name,
				level,
				turnoutLabel: m.map_change_label_short({ year: compareYear }),
				turnoutValue:
					!was || !now
						? '–'
						: was.partyName === now.partyName
							? m.map_change_same()
							: m.map_change_flipped(),
				rows,
				hint: rows.length ? drillHint : noPairHint
			};
		}
		if (splitting || changing) {
			// Headline stat becomes the difference in points; rows show both shares.
			const s = pairOf(hoverBreakdown, secondCache.get(hoveredKey!));
			return {
				name,
				level,
				// Party-less so it fits on one line beside the value in the 244px card.
				turnoutLabel: splitting
					? m.map_split_diff_label_short()
					: m.map_change_label_short({ year: compareYear }),
				turnoutValue: !s
					? '–'
					: absoluteValues
						? fmtVoteDiff(s.aVotes == null || s.bVotes == null ? null : s.aVotes - s.bVotes)
						: fmtDiff(s.diff),
				rows: s ? pairRows(s, absoluteValues) : [],
				hint: s ? drillHint : noPairHint
			};
		}
		return {
			name,
			level,
			// "Stimmen" setting: voters instead of the turnout share.
			turnoutLabel: absoluteValues ? m.map_stat_waehlende() : m.map_info_wahlbeteiligung(),
			turnoutValue: absoluteValues
				? fmtNum(votersOf(hoverBreakdown))
				: fmtPct(hoverBreakdown.turnout),
			rows,
			hint: drillHint
		};
	});

	// ---- Left panel -------------------------------------------------------------------------------

	const panelCode = $derived(
		focused.level === 'Land'
			? 'BW'
			: focused.level === 'Wahlbezirk'
				? (focused.stationKey ?? '')
				: String(focused.rs)
	);
	const panelSub = $derived(
		(panelParentEntry ? panelParentEntry.name + ' · ' : '') + electionLabelText
	);
	const panelSplit = $derived(splitting ? pairOf(panelBreakdown, panelSecond) : null);
	const rowsHeadingLeft = $derived(
		// Always name the Stimme when there are two, so the panel can't be misread.
		splitting
			? m.map_split_diff_label({ party: selectedParty })
			: !hasTwoVotes
				? m.map_rows_heading_stimmenanteile()
				: selectedVoteType === '0'
					? m.map_erststimmen()
					: `${m.map_zweitstimmen()} · ${m.map_rows_heading_landeslisten()}`
	);
	/** Extra heading info next to the Anteil/Stimmen switch (which itself names the value column). */
	const rowsHeadingRight = $derived(
		splitting
			? panelSplit
				? absoluteValues
					? fmtVoteDiff(
							panelSplit.aVotes == null || panelSplit.bVotes == null
								? null
								: panelSplit.aVotes - panelSplit.bVotes
						)
					: fmtDiff(panelSplit.diff)
				: m.map_split_no_candidate()
			: changing
				? m.map_change_label_short({ year: compareYear })
				: panelBreakdown?.seatTotal != null
					? m.map_stat_sitze()
					: ''
	);
	// Empty = no third stat (a leaf has no sub-areas to count).
	const panelUnitLabel = $derived(
		panelBreakdown?.seatTotal != null
			? m.map_stat_sitze()
			: panelWk
				? m.map_mode_wahlkreis()
				: leaf
					? ''
					: levelPlural(displayLevel)
	);
	const panelUnitValue = $derived(
		panelBreakdown?.seatTotal != null
			? String(panelBreakdown.seatTotal)
			: panelWk
				? panelWk.ref
				: String(scopedGeojson.features.length)
	);
	const PANEL_TOP_N = 9;
	/** Veränderung: "old → new" under the name and the change in points as the value. */
	/** Veränderung: "old → new" under the name, the change in points as the value, and both years as
	 * bars on one scale (`scaleMax` = 100 %) so their lengths compare directly. */
	function withChange(
		row: PanelRow,
		now: number | null | undefined,
		old: number | null | undefined,
		scaleMax: number,
		/** Vote counts (now, then) for the "Stimmen" setting. */
		votes: [number | null | undefined, number | null | undefined] = [null, null]
	): PanelRow {
		if (!changing) return row;
		const width = (v: number) => barWidth((v / scaleMax) * 100);
		const [nowVotes, oldVotes] = votes;
		return {
			...row,
			secondary: absoluteValues
				? `${fmtNum(oldVotes)} → ${fmtNum(nowVotes)}`
				: `${fmtPct(old)} → ${fmtPct(now)}`,
			pct: absoluteValues
				? nowVotes == null || oldVotes == null
					? '–'
					: fmtVoteDiff(nowVotes - oldVotes)
				: now == null || old == null
					? '–'
					: fmtDiff(now - old),
			widthPercent: now == null ? row.widthPercent : width(now),
			oldWidthPercent: old == null ? null : width(old)
		};
	}
	/** Largest party share in either year — the shared bar scale for Veränderung's panel rows. */
	const changeScaleMax = $derived(
		Math.max(
			0.0001,
			...[...(panelBreakdown?.rows ?? []), ...(panelSecond?.rows ?? [])].map(
				(r) => r.votePercent ?? 0
			)
		)
	);
	function toPanelRow(r: ReturnType<typeof toRows>[number]): PanelRow {
		const open = candidatesAvailable && candidateParty === r.key;
		const row = {
			key: r.key,
			color: r.color,
			primary: r.name,
			secondary: null,
			pct: r.pct,
			seats: r.seats,
			widthPercent: r.widthPercent,
			...(candidatesAvailable && r.key !== 'unknown'
				? {
						onSelect: () => (candidateParty = open ? null : r.key),
						expanded: open,
						candidates: open
							? (candidates?.map((c) => ({ ...c, votes: fmtNum(c.votes) })) ?? null)
							: null
					}
				: {})
		};
		const find = (b: RegionBreakdown | null | undefined) =>
			b?.rows.find((x) => x.partyName === r.key);
		return withChange(
			row,
			find(panelBreakdown)?.votePercent,
			find(panelSecond)?.votePercent,
			changeScaleMax,
			[find(panelBreakdown)?.voteCount, find(panelSecond)?.voteCount]
		);
	}
	/** Veränderung: turnout old → new as the first panel row. */
	const turnoutChangeRow = $derived.by((): PanelRow[] => {
		const now = panelBreakdown?.turnout;
		const before = panelSecond?.turnout;
		if (!changing || now == null) return [];
		const row = {
			key: 'turnout',
			color: 'var(--map-ink-muted)',
			primary: m.map_info_wahlbeteiligung(),
			pct: fmtPct(now),
			widthPercent: Math.min(100, now)
		};
		return [withChange(row, now, before, 100, [votersOf(panelBreakdown), votersOf(panelSecond)])];
	});
	/** Parties beyond the top 9, collapsed into one summed "Sonstige" row by default — clicking it
	 * expands to the individual result of every remaining party (and back). Percent shares within one
	 * breakdown already share the same denominator, so summing them (unlike combining across regions —
	 * see `sumBreakdowns`) is exact, not an approximation. */
	const panelRows = $derived.by((): PanelRow[] => [...turnoutChangeRow, ...partyPanelRows]);
	const partyPanelRows = $derived.by((): PanelRow[] => {
		if (splitting)
			return panelSplit
				? pairRows(panelSplit, absoluteValues).map((r) => ({ ...r, primary: r.name, seats: null }))
				: [];
		// A "Sonstige" row only pays off when it groups at least two parties — with just one more
		// party than the top 9, list it as the 10th row instead.
		if (!panelBreakdown || panelBreakdown.rows.length <= PANEL_TOP_N + 1)
			return toRows(panelBreakdown, null, absoluteValues).map(toPanelRow);

		const topRows = toRows(panelBreakdown, PANEL_TOP_N, absoluteValues).map(toPanelRow);
		if (sonstigeExpanded) {
			const restRows = toRows(panelBreakdown, null, absoluteValues)
				.slice(PANEL_TOP_N)
				.map(toPanelRow);
			return [
				...topRows,
				...restRows,
				{
					key: 'sonstige-collapse',
					color: null,
					primary: m.map_panel_sonstige_collapse(),
					pct: '',
					seats: null,
					widthPercent: 0,
					onToggle: () => (sonstigeExpanded = false)
				}
			];
		}

		const restRaw = panelBreakdown.rows.slice(PANEL_TOP_N);
		const pct = restRaw.reduce((sum, r) => sum + (r.votePercent ?? 0), 0);
		const seatsSum = restRaw.reduce((sum, r) => sum + (r.seats ?? 0), 0);
		const hasSeats = restRaw.some((r) => r.seats != null);
		const max = Math.max(...panelBreakdown.rows.map((r) => r.votePercent ?? 0), 0.0001);
		// Veränderung: the same parties' earlier shares, summed (parties that didn't run then count 0).
		const old = (r: RegionBreakdown['rows'][number]) =>
			panelSecond?.rows.find((o) => o.partyName === r.partyName);
		const oldPct = restRaw.reduce((sum, r) => sum + (old(r)?.votePercent ?? 0), 0);
		const votes = restRaw.reduce((sum, r) => sum + (r.voteCount ?? 0), 0);
		const oldVotes = restRaw.reduce((sum, r) => sum + (old(r)?.voteCount ?? 0), 0);
		return [
			...topRows,
			withChange(
				{
					key: 'sonstige',
					color: '#cfc8ba',
					primary: m.map_panel_sonstige(),
					pct: absoluteValues ? fmtNum(votes) : fmtPct(pct),
					seats: hasSeats ? String(seatsSum) : null,
					widthPercent: barWidth((pct / max) * 100),
					onToggle: () => (sonstigeExpanded = true)
				},
				pct,
				panelSecond ? oldPct : null,
				changeScaleMax,
				[votes, panelSecond ? oldVotes : null]
			)
		];
	});
	/** "Some Gemeinden below this area have no results" — only for aggregate scopes (Land /
	 * Regierungsbezirk / Kreis), where a gap silently shrinks the totals. Skipped for Regionalwahl
	 * (only Region Stuttgart votes, so "no data" is expected elsewhere) and for Wahlkreise (no
	 * Gemeinde→Wahlkreis mapping on the client). */
	const missingNote = $derived.by(() => {
		const withData = gemeindenWithData;
		if (!withData || !allGemeindeRs || panelWk) return null;
		if (selectedElectionType === REGIONALWAHL_TYPE) return null;
		const lvl = focused.level;
		if (lvl !== 'Land' && lvl !== 'Regierungsbezirk' && lvl !== 'Kreis') return null;
		const prefix = lvl === 'Land' ? '' : rsPrefix(focused.rs!, lvl === 'Regierungsbezirk' ? 2 : 4);
		const expected = allGemeindeRs.filter(
			(rs) =>
				rsPrefix(rs, 4).startsWith(prefix) &&
				!NO_ELECTION_RS.has(rs) &&
				// Kreisfreie Städte never hold a Kreistagswahl (see KREISTAGSWAHL_TYPE).
				!(selectedElectionType === KREISTAGSWAHL_TYPE && KREISFREIE_STADT_RS.has(rs))
		);
		const missing = expected.filter((rs) => !withData.has(rs)).length;
		return missing > 0 ? m.map_panel_missing_note({ missing, total: expected.length }) : null;
	});
	/** "Joint lists count for every partner" — above a single Gemeinde, a joint list like "CDU/FWV" is
	 * aggregated into each partner family, which shows as shares adding up to more than 100 %. (A single
	 * Gemeinde lists joint lists on their own, see splitLists on the server; the Land total is re-derived
	 * from vote counts and always sums to exactly 100 %, so the note — which says "over 100 %" — never
	 * shows there.) */
	const jointListNote = $derived(
		panelBreakdown && panelBreakdown.rows.reduce((sum, r) => sum + (r.votePercent ?? 0), 0) > 100.05
			? m.map_panel_joint_list_note()
			: null
	);
	/** Election dates whose Stuttgart Wahlbezirk results carry no postal votes: in 2019 (and the
	 * Landtagswahl 2016, on the same Bezirke) the postal districts didn't map 1:1 onto urn districts
	 * and the city never published the assignment (see stuttgart-districts/2019-05-26.json), so each
	 * Wahlbezirk shows urn votes only. */
	const STUTTGART_URN_ONLY_DATES = new Set(['2019-05-26', '2016-03-13']);
	const urnOnlyNote = $derived(
		STUTTGART_URN_ONLY_DATES.has(selectedDate) &&
			!panelWk &&
			focused.rs === STUTTGART_RS &&
			(focused.level === 'Wahlbezirk' || (focused.level === 'Gemeinde' && !leaf))
			? m.map_panel_stuttgart_urn_only_note()
			: null
	);
	const postalEstimatedNote = $derived(
		wahlbezirkPostalEstimated(selectedDate) &&
			!panelWk &&
			(focused.level === 'Wahlbezirk' ||
				(focused.level === 'Gemeinde' && focused.rs !== null && bezirkGemeinden.has(focused.rs)))
			? focused.rs === STUTTGART_RS
				? m.map_panel_postal_estimated_note_stuttgart()
				: m.map_panel_postal_estimated_note()
			: null
	);
	const panelFootnote = $derived(
		panelWk || leaf ? m.map_panel_footnote_leaf() : m.map_panel_footnote_drill()
	);

	// ---- Map-area chrome ----------------------------------------------------------------------

	const modeBadgeText = $derived(
		wahlkreisActive
			? m.map_mode_wahlkreis()
			: splitting || changing || dotMode
				? visualModeLabel(selectedVisualMode)
				: hasTwoVotes
					? selectedVoteType === '0'
						? m.map_erststimmen()
						: m.map_zweitstimmen()
					: currentElectionDescription
	);
	const statusLineText = $derived.by(() => {
		if (wahlkreisActive)
			return `${m.map_status_region_count({ count: scopedGeojson.features.length, level: m.map_mode_wahlkreis() })} · ${electionLabelText}`;
		if (leaf) return `${m.map_hover_tiefste_ebene()} · ${electionLabelText}`;
		return `${m.map_status_region_count({ count: scopedGeojson.features.length, level: levelPlural(displayLevel) })} · ${electionLabelText}`;
	});

	const legendMode = $derived(
		legend?.type === 'parties'
			? 'party'
			: legend?.type === 'turnout'
				? 'turnout'
				: legend?.type === 'diff'
					? 'diff'
					: 'hochburg'
	);
	const legendTitle = $derived(
		changing
			? m.map_change_label({ party: selectedPartyLabel, year: compareYear })
			: legendMode === 'party'
				? visualModeLabel(
						selectedVisualMode === '2. Stärkste Partei' ? '2. Stärkste Partei' : 'Stärkste Partei'
					)
				: legendMode === 'turnout'
					? m.map_info_wahlbeteiligung()
					: legendMode === 'diff'
						? m.map_split_diff_label({ party: selectedParty })
						: m.map_legend_title_hochburg({ party: selectedParty })
	);
	const legendNote = $derived(
		legendMode === 'party'
			? hasTwoVotes
				? selectedVoteType === '0'
					? m.map_legend_note_erststimme()
					: m.map_legend_note_zweitstimme()
				: ''
			: legendMode === 'diff'
				? '' // the end labels already say "Pkt."; leaves room for the title
				: '%'
	);
	// The backend's `regionData` results cover every region state-wide per grain (e.g. all ~44 Kreise,
	// not just the current Regierungsbezirk's 12) — the legend should only name parties actually shown
	// in the mosaic right now, so it's scoped to `displayGeojson`'s own keys, not the raw query results.
	const displayedKeySet = $derived(
		new Set(displayGeojson.features.map((f) => String(f.properties?.[keyProperty])))
	);
	const legendPartyEntries = $derived.by(() => {
		if (legendMode !== 'party') return [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain local accumulator, built and consumed entirely within this one call
		const counts = new Map<string, { color: string; count: number }>();
		for (const item of items) {
			if (!displayedKeySet.has(item.key)) continue;
			const name = item.partyName as string | null | undefined;
			const color = (item.partyColor as string | undefined) ?? item.color;
			if (!name || !color) continue;
			const entry = counts.get(name) ?? { color, count: 0 };
			entry.count++;
			counts.set(name, entry);
		}
		return Array.from(counts, ([name, { color, count }]) => ({ name, color, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
			.map(({ name, color }) => ({ name, color }));
	});

	/** The hovered region's value on the *current* gradient legend's own scale (turnout % for
	 * Wahlbeteiligung, the selected party's vote share for Hochburg) — drives a position marker on the
	 * gradient bar so the legend itself answers "where does this region sit". */
	const hoveredLegendValue = $derived.by(() => {
		if (!hoverBreakdown) return null;
		if (legendMode === 'turnout') return hoverBreakdown.turnout;
		if (legendMode === 'hochburg')
			return hoverBreakdown.rows.find((r) => r.partyName === selectedParty)?.votePercent ?? null;
		if (legendMode === 'diff')
			return pairOf(hoverBreakdown, secondCache.get(hoveredKey!))?.diff ?? null;
		return null;
	});
	const hoveredLegendMarkerPercent = $derived.by(() => {
		if (hoveredLegendValue === null || legend?.min === undefined || legend?.max === undefined)
			return null;
		const { min, max } = legend;
		if (max === min) return 50;
		return Math.min(100, Math.max(0, ((hoveredLegendValue - min) / (max - min)) * 100));
	});

	let mapAreaEl: HTMLDivElement | undefined = $state();
	let mapWidth = $state(800);
	let mapHeight = $state(600);
	$effect(() => {
		if (!mapAreaEl) return;
		const el = mapAreaEl;
		const measure = () => {
			mapWidth = el.clientWidth;
			mapHeight = el.clientHeight;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<div class="map-root app">
	<Toolbar
		{electionOptions}
		selectedElectionType={String(selectedElectionType)}
		{onElectionChange}
		{dateOptions}
		{selectedDate}
		{onDateChange}
		{stimmeTabs}
		{ebeneOptions}
		selectedEbene={selectedEbeneValue}
		{onEbeneChange}
		{modusTabs}
		{hochburgPartyOptions}
		selectedHbParty={selectedParty}
		hbPartyColor={legend?.color ?? '#9c4a2f'}
		{onHbPartyChange}
		{compareOptions}
		selectedCompare={selectedCompareDate}
		{onCompareChange}
		onReset={resetView}
	/>

	<div class="body">
		<ResultPanel
			levelLabel={panelWk ? m.map_mode_wahlkreis() : levelSingular(focused.level)}
			code={panelWk ? panelWk.ref : panelCode}
			canGoUp={panelWk ? true : canGoUp}
			parentName={panelWk ? LAND_ROOT.name : (panelParentEntry?.name ?? '')}
			onGoUp={panelWk ? () => (selectedWahlkreis = null) : goUp}
			name={panelWk ? panelWk.name : focused.name}
			sub={panelWk ? electionLabelText : panelSub}
			turnoutLabel={m.map_info_wahlbeteiligung()}
			turnoutValue={fmtPct(panelBreakdown?.turnout)}
			eligibleLabel={m.map_stat_wahlberechtigt()}
			eligibleValue={fmtNum(panelBreakdown?.eligible)}
			unitLabel={panelUnitLabel}
			unitValue={panelUnitValue}
			{rowsHeadingLeft}
			{rowsHeadingRight}
			rows={panelRows}
			footnote={panelFootnote}
			peopleGroups={mandateGroups}
			absolute={absoluteValues}
			onToggleAbsolute={() => (absoluteValues = !absoluteValues)}
			notes={[
				missingNote,
				jointListNote,
				urnOnlyNote,
				postalEstimatedNote,
				panelBreakdown?.postalElsewhere ? m.map_panel_postal_elsewhere_note() : null
			].filter((n) => n !== null)}
			explanation={splitting
				? m.map_split_explanation()
				: changeMetric === 'Stärkste Partei' || changeMetric === '2. Stärkste Partei'
					? m.map_change_explanation_winner({ metric: selectedPartyLabel, year: compareYear })
					: changing
						? m.map_change_explanation({ year: compareYear })
						: dotMode && dotData
							? m.map_dots_explanation({ n: fmtNum(dotData.perDot) })
							: null}
			seats={panelBreakdown?.seatTotal
				? panelBreakdown.rows.map((r) => ({
						name: r.partyName,
						color: r.color,
						seats: r.seats ?? 0
					}))
				: null}
		>
			<SearchBox {findPlaces} {findPeople} />
		</ResultPanel>

		<div class="map-area" bind:this={mapAreaEl}>
			<MapView
				geojson={displayGeojson}
				fitBoundsGeojson={fitGeojson}
				labelGeojson={displayGeojson}
				{sourceKey}
				{keyProperty}
				{items}
				onFeatureClick={handleFeatureClick}
				onFeatureHover={handleFeatureHover}
				labelProperty="name"
				animateFit
				dots={dotData?.dots ?? null}
			/>

			{#if !wahlkreisActive}
				<BreadcrumbPill
					{crumbs}
					onCrumbClick={goTo}
					showUp={canGoUp}
					upLabel={m.map_breadcrumb_back()}
					onUp={goUp}
				/>
			{/if}

			<ModeBadge text={modeBadgeText} />

			{#if dotMode && dotData}
				<Legend
					mode="party"
					title={m.map_dots_legend({ n: fmtNum(dotData.perDot) })}
					note=""
					partyEntries={dotData.entries}
				/>
			{:else if legend}
				<Legend
					mode={legendMode}
					title={legendTitle}
					note={legendNote}
					partyEntries={legendPartyEntries}
					turnoutMinLabel={legend.min !== undefined ? `${legend.min.toFixed(0)} %` : ''}
					turnoutMaxLabel={legend.max !== undefined ? `${legend.max.toFixed(0)} %` : ''}
					hochburgColor={legend.color ?? '#9c4a2f'}
					hochburgMinLabel={legend.min !== undefined ? `${legend.min.toFixed(0)} %` : ''}
					hochburgMaxLabel={legend.max !== undefined ? `${legend.max.toFixed(0)} %` : ''}
					diffMinLabel={legend.min !== undefined ? fmtDiff(legend.min) : ''}
					diffMaxLabel={legend.max !== undefined ? fmtDiff(legend.max) : ''}
					diffPlusWord={changing ? m.map_change_legend_gain() : m.map_split_legend_erst_ahead()}
					diffMinusWord={changing ? m.map_change_legend_loss() : m.map_split_legend_zweit_ahead()}
					markerPercent={hoveredLegendMarkerPercent}
				/>
			{/if}

			<StatusLine text={statusLineText} />

			<HoverCard
				point={hoverPoint}
				containerWidth={mapWidth}
				containerHeight={mapHeight}
				data={hoverData}
			/>
		</div>
	</div>
</div>

<style>
	.app {
		height: 100vh;
		width: 100vw;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.map-area {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
		background: var(--map-bg-surface-muted);
	}
</style>
