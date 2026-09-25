<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';
	import '$lib/components/map/theme.css';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import CrawlMap from '$lib/components/CrawlMap.svelte';

	let { data }: { data: PageData } = $props();

	type Status = 'running' | 'done' | 'error';
	type CityStatus = 'in_progress' | 'done' | 'skipped';

	interface ProgressTick {
		level: 'step' | 'city' | 'station' | 'family';
		index: number;
		total: number;
		label: string;
	}
	interface ProgressState {
		step?: ProgressTick;
		city?: ProgressTick;
		station?: ProgressTick;
		family?: ProgressTick;
	}

	interface CrawlState {
		runId: number;
		date: string;
		electionType: number;
		status: Status;
		log: string[];
		error: string | null;
		startedAt: string;
		progress: ProgressState;
		cityStatus: Record<number, CityStatus>;
	}

	interface DateDiscoveryState {
		status: Status;
		log: string[];
		dates: string[];
		error: string | null;
		startedAt: string;
		progress: ProgressState;
		cityStatus: Record<number, CityStatus>;
	}

	let date = $state(data.lastRun?.date ?? data.knownDates[0] ?? '');
	let electionTypeId = $state(
		data.lastRun?.electionType ?? data.electionTypes[0]?.electionType ?? 0
	);
	let starting = $state(false);
	let startError = $state<string | null>(null);
	let liveState = $state<CrawlState | null>(null);
	let dateDiscoveryState = $state<DateDiscoveryState | null>(null);
	let now = $state(Date.now());
	let logEl = $state<HTMLPreElement>();

	// The live state carries no end timestamp (only `startedAt`) — freeze the wall-clock moment the run
	// stops so the "completed in"/"failed after" duration doesn't keep counting up after the fact. Reset
	// as soon as a new run starts (a fresh CrawlState with status 'running' arrives).
	let crawlFinishedAtMs = $state<number | null>(null);

	onMount(() => {
		// Always connect — this picks up a crawl/date-refresh that's already running (e.g. after a page
		// reload), not just ones started from this tab.
		const crawlSource = new EventSource('/admin/crawl/status');
		crawlSource.onmessage = (event) => {
			liveState = JSON.parse(event.data) as CrawlState | null;
		};
		const datesSource = new EventSource('/admin/dates/refresh/status');
		datesSource.onmessage = (event) => {
			dateDiscoveryState = JSON.parse(event.data) as DateDiscoveryState | null;
		};
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => {
			crawlSource.close();
			datesSource.close();
			clearInterval(timer);
		};
	});

	const isRunning = $derived(liveState?.status === 'running');
	const isDateRefreshRunning = $derived(dateDiscoveryState?.status === 'running');

	// Once a "Termine aktualisieren" run finishes, its results are in `elections` — reload the page's
	// server data (knownDates/datesToTypes) so the dropdowns reflect them.
	$effect(() => {
		if (dateDiscoveryState?.status === 'done') invalidateAll();
	});

	$effect(() => {
		if (liveState?.status === 'running') crawlFinishedAtMs = null;
		else if (liveState && crawlFinishedAtMs === null) crawlFinishedAtMs = Date.now();
	});

	// Which dates the selected Wahlart actually happened on, per data already loaded from `elections` —
	// no live lookup needed. A date with no classified elections yet (e.g. one just discovered but never
	// crawled) could be any type, so it's offered for every type.
	const filteredDates = $derived(
		data.knownDates.filter((d) => {
			const types = data.datesToTypes[d];
			return types.length === 0 || types.includes(electionTypeId);
		})
	);

	// Keep the date selection valid as the Wahlart (and therefore the filtered list) changes.
	$effect(() => {
		if (filteredDates.length > 0 && !filteredDates.includes(date)) date = filteredDates[0];
	});

	function dateOptionLabel(d: string): string {
		const counts = data.gemeindeCounts[`${d}|${electionTypeId}`];
		return counts
			? m.admin_crawl_date_option({
					date: d,
					withData: String(counts.withData),
					gemeinden: String(counts.gemeinden)
				})
			: d;
	}

	function typeLabel(id: number): string {
		return data.electionTypes.find((t) => t.electionType === id)?.electionDescription ?? String(id);
	}

	function statusLabel(status: Status): string {
		switch (status) {
			case 'running':
				return m.admin_status_running();
			case 'done':
				return m.admin_status_done();
			case 'error':
				return m.admin_status_error();
		}
	}

	function durationLabel(status: Status, duration: string): string {
		switch (status) {
			case 'running':
				return m.admin_status_duration_running({ duration });
			case 'done':
				return m.admin_status_duration_done({ duration });
			case 'error':
				return m.admin_status_duration_error({ duration });
		}
	}

	function levelKicker(level: ProgressTick['level']): string {
		switch (level) {
			case 'step':
				return m.admin_status_level_step();
			case 'city':
				return m.admin_status_level_city();
			case 'station':
				return m.admin_status_level_station();
			case 'family':
				return m.admin_status_level_family();
		}
	}

	function formatDuration(ms: number): string {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(totalSeconds / 3600);
		const mnt = Math.floor((totalSeconds % 3600) / 60);
		const s = totalSeconds % 60;
		const mm = String(mnt).padStart(2, '0');
		const ss = String(s).padStart(2, '0');
		return h > 0 ? `${h}:${mm}:${ss}` : `${mnt}:${ss}`;
	}

	function errorMessage(reason: string, context: 'crawl' | 'refresh'): string {
		switch (reason) {
			case 'already_running':
				return m.admin_crawl_error_already_running();
			case 'missing_fields':
				return m.admin_crawl_error_missing_fields();
			default:
				return context === 'crawl'
					? m.admin_crawl_error_generic()
					: m.admin_crawl_date_refresh_error_generic();
		}
	}

	async function startCrawl() {
		startError = null;
		starting = true;
		try {
			const res = await fetch('/admin/crawl', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, electionTypeId })
			});
			const body = await res.json();
			if (!body.started) startError = errorMessage(body.reason ?? '', 'crawl');
		} catch {
			startError = errorMessage('', 'crawl');
		} finally {
			starting = false;
		}
	}

	async function refreshDates() {
		startError = null;
		try {
			const res = await fetch('/admin/dates/refresh', { method: 'POST' });
			const body = await res.json();
			if (!body.started) startError = errorMessage(body.reason ?? '', 'refresh');
		} catch {
			startError = errorMessage('', 'refresh');
		}
	}

	// Unified view for the status card: prefer the live SSE state (this server process actually ran/is
	// running it, so it has structured progress) and fall back to the last persisted run from the DB
	// (e.g. after a reload against a server instance that didn't run it, or restarted mid-crawl) — that
	// fallback has no progress ticks, only the flat log text.
	const display = $derived.by(() => {
		if (liveState) {
			const start = new Date(liveState.startedAt).getTime();
			const end = liveState.status === 'running' ? now : (crawlFinishedAtMs ?? now);
			return {
				status: liveState.status,
				date: liveState.date,
				electionType: liveState.electionType,
				durationMs: end - start,
				log: liveState.log,
				error: liveState.error,
				progress: liveState.progress,
				cityStatus: liveState.cityStatus,
				hasProgress: true
			};
		}
		if (data.lastRun) {
			const start = data.lastRun.startedAt.getTime();
			const end = data.lastRun.finishedAt ? data.lastRun.finishedAt.getTime() : now;
			return {
				status: data.lastRun.status as Status,
				date: data.lastRun.date,
				electionType: data.lastRun.electionType,
				durationMs: end - start,
				log: data.lastRun.log ? data.lastRun.log.split('\n') : [],
				error: data.lastRun.error,
				progress: {} as ProgressState,
				cityStatus: {} as Record<number, CityStatus>,
				hasProgress: false
			};
		}
		return null;
	});

	// Per-Gemeinde tallies for the counters under the progress bars.
	const cityCounts = $derived.by(() => {
		const counts = { done: 0, in_progress: 0, skipped: 0 };
		for (const s of Object.values(display?.cityStatus ?? {})) counts[s] += 1;
		return counts;
	});

	const COUNTER_COLORS = { done: '#4f7a52', in_progress: '#e0b481', skipped: '#6f6658' };

	$effect(() => {
		void display?.log;
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	});
</script>

<svelte:head>
	<title>{m.admin_title()} · {m.map_brand_name()}</title>
</svelte:head>

<div class="map-root app">
	<header class="toolbar">
		<div class="brand-block">
			<span class="logo">
				<span class="bar" style="height: 8px"></span>
				<span class="bar" style="height: 15px"></span>
				<span class="bar" style="height: 11px"></span>
			</span>
			<span class="wordmark">
				<span class="brand">{m.map_brand_name()}</span>
				<span class="map-lbl region">{m.admin_brand_subtitle()}</span>
			</span>
		</div>
		<span class="map-lbl status-text">
			{#if display}
				{statusLabel(display.status)} · {durationLabel(
					display.status,
					formatDuration(display.durationMs)
				)}
			{:else}
				{m.admin_status_idle()}
			{/if}
		</span>
		<div class="aside">
			<a class="link" href="/">{m.admin_nav_map()}</a>
			<form method="POST" action="/admin/logout">
				<button type="submit" class="link">{m.admin_logout()}</button>
			</form>
			<div class="segmented">
				{#each locales as locale (locale)}
					<button
						type="button"
						class="pill"
						class:active={getLocale() === locale}
						onclick={() => setLocale(locale)}>{locale.toUpperCase()}</button
					>
				{/each}
			</div>
		</div>
	</header>

	<div class="body">
		<aside class="panel">
			<div class="section header">
				<h2 class="heading">{m.admin_crawl_start_heading()}</h2>
				<p class="intro">{m.admin_intro()}</p>
			</div>

			<div class="section fields">
				<label class="field">
					<span class="map-lbl field-label">{m.admin_crawl_electiontype_label()}</span>
					<select
						class="select"
						bind:value={electionTypeId}
						disabled={data.electionTypes.length === 0 || isRunning}
					>
						{#each data.electionTypes as t (t.electionType)}
							<option value={t.electionType}>{t.electionDescription ?? t.electionType}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span class="map-lbl field-label">{m.admin_crawl_date_label()}</span>
					<span class="field-row">
						<select
							class="select select-mono"
							bind:value={date}
							disabled={filteredDates.length === 0 || isRunning}
						>
							{#if filteredDates.length === 0}
								<option value="">{m.admin_crawl_date_placeholder()}</option>
							{/if}
							{#each filteredDates as d (d)}
								<option value={d}>{dateOptionLabel(d)}</option>
							{/each}
						</select>
						<button
							type="button"
							class="secondary"
							onclick={refreshDates}
							disabled={starting || isRunning || isDateRefreshRunning}
						>
							{m.admin_crawl_date_refresh_button()}
						</button>
					</span>
				</label>

				{#if dateDiscoveryState}
					<div class="note-box">
						{#if dateDiscoveryState.status === 'running'}
							{#if dateDiscoveryState.progress.step}
								<ProgressBar
									kicker={levelKicker('step')}
									label={dateDiscoveryState.progress.step.label}
									current={dateDiscoveryState.progress.step.index}
									total={dateDiscoveryState.progress.step.total}
								/>
							{/if}
							{#if dateDiscoveryState.progress.city}
								<ProgressBar
									kicker={levelKicker('city')}
									label={dateDiscoveryState.progress.city.label}
									current={dateDiscoveryState.progress.city.index}
									total={dateDiscoveryState.progress.city.total}
								/>
							{/if}
						{:else if dateDiscoveryState.status === 'done'}
							<span class="ok">
								{m.admin_crawl_date_refresh_done({
									count: String(dateDiscoveryState.dates.length)
								})}
							</span>
						{:else}
							<span class="err">{dateDiscoveryState.error}</span>
						{/if}
					</div>
				{/if}
			</div>

			<div class="section action">
				<button
					type="button"
					class="primary"
					onclick={startCrawl}
					disabled={starting || isRunning || isDateRefreshRunning || !filteredDates.includes(date)}
				>
					{m.admin_crawl_start_button()}
				</button>
				{#if startError}
					<p class="err">{startError}</p>
				{/if}

				{#if display?.hasProgress && display.status === 'running'}
					{#each ['step', 'city', 'station', 'family'] as const as level (level)}
						{@const tick = display.progress[level]}
						{#if tick}
							<ProgressBar
								kicker={levelKicker(level)}
								label={tick.label}
								current={tick.index}
								total={tick.total}
							/>
						{/if}
					{/each}
				{/if}

				{#if display?.hasProgress}
					<div class="counters">
						{#each ['done', 'in_progress', 'skipped'] as const as key (key)}
							<span class="counter">
								<span class="swatch" style="background: {COUNTER_COLORS[key]}"></span>
								{key === 'done'
									? m.admin_map_status_done()
									: key === 'in_progress'
										? m.admin_map_status_in_progress()
										: m.admin_map_status_skipped()}
								<span class="counter-value">{cityCounts[key]}</span>
							</span>
						{/each}
					</div>
				{/if}

				{#if display?.error}
					<p class="err">{display.error}</p>
				{/if}
			</div>

			<div class="log-heading">
				<span class="map-lbl" style="color: var(--map-ink)">{m.admin_log_heading()}</span>
				{#if display}
					<span class="map-lbl" style="color: var(--map-ink-muted)">
						{m.admin_log_count({ count: String(display.log.length) })}
					</span>
				{/if}
			</div>
			<pre bind:this={logEl} class="log">{display
					? display.log.length
						? display.log.join('\n')
						: m.admin_status_log_waiting()
					: `${m.admin_status_none()}\n${m.admin_status_none_hint()}`}</pre>
		</aside>

		<div class="map-area">
			<CrawlMap cityStatus={display?.cityStatus ?? {}} />

			<div class="pill-bar">
				<span class="status-pill">
					<span
						class="dot"
						style="background: {display?.status === 'running'
							? 'var(--map-accent)'
							: display?.status === 'done'
								? 'var(--map-success-fill)'
								: display?.status === 'error'
									? 'var(--map-error-text)'
									: '#c4bba7'}"
					></span>
					{display
						? m.admin_status_meta({ type: typeLabel(display.electionType), date: display.date })
						: m.admin_status_idle()}
				</span>
			</div>

			{#if display?.status === 'running' && display.progress.city}
				<div class="current">
					<div class="map-lbl" style="color: var(--map-ink); margin-bottom: 7px">
						{m.admin_map_current()}
					</div>
					<div class="current-name">{display.progress.city.label}</div>
					<div class="current-code">
						{display.progress.city.index}/{display.progress.city.total}
					</div>
				</div>
			{/if}
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
		color: var(--map-ink);
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	/* Toolbar: same shell as the Kartenansicht's (map/Toolbar.svelte). */
	.toolbar {
		flex: none;
		display: flex;
		align-items: center;
		gap: 10px 14px;
		flex-wrap: wrap;
		padding: 10px 14px;
		min-height: 60px;
		box-sizing: border-box;
		background: var(--map-bg-surface);
		border-bottom: 1px solid var(--map-border-strong);
	}
	.brand-block {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.region {
		color: var(--map-accent);
		margin-top: 3px;
	}
	.status-text {
		color: var(--map-ink-muted);
		flex: 1;
	}
	.aside {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.link {
		font: 500 12.5px var(--map-font-body);
		color: var(--map-accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: none;
	}
	.link:hover {
		color: var(--map-accent-hover);
	}
	.segmented {
		display: flex;
		padding: 2px;
		background: var(--map-bg-surface-sunken);
		border-radius: 7px;
	}
	.pill {
		font: 500 11.5px var(--map-font-body);
		padding: 3px 8px;
		border-radius: 5px;
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

	/* Left panel: same frame as the Kartenansicht's ResultPanel. */
	.panel {
		flex: 0 1 360px;
		min-width: 290px;
		background: var(--map-bg-surface);
		border-right: 1px solid var(--map-border-strong);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	.section {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.header {
		padding: 18px 20px 14px;
		gap: 4px;
	}
	.heading {
		margin: 0;
		font-family: var(--map-font-heading);
		font-size: 23px;
		font-weight: 500;
		line-height: 1.15;
	}
	.intro {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-row {
		display: flex;
		gap: 6px;
	}
	.field-row .select {
		flex: 1;
		min-width: 0;
	}
	.select {
		padding: 8px 10px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font: 500 12.5px var(--map-font-body);
		color: var(--map-ink);
		cursor: pointer;
	}
	.select-mono {
		font: 500 12px var(--map-font-mono);
		color: var(--map-ink-2);
	}
	.select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.secondary {
		flex: none;
		padding: 8px 11px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: #fff;
		color: var(--map-ink-2);
		font: 500 12px var(--map-font-body);
		cursor: pointer;
	}
	.secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.note-box {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-a);
	}
	.primary {
		padding: 12px 16px;
		border-radius: 6px;
		border: 1px solid var(--map-ink);
		background: var(--map-ink);
		color: var(--map-on-dark);
		font: 600 13px var(--map-font-body);
		cursor: pointer;
	}
	.primary:disabled {
		background: #fff;
		color: var(--map-ink);
		opacity: 0.6;
		cursor: not-allowed;
	}
	.counters {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.counter {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--map-ink-2);
	}
	.counter-value {
		font: 500 11.5px var(--map-font-mono);
		color: var(--map-ink);
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		flex: none;
		border: 0.5px solid var(--map-swatch-border);
	}
	.ok,
	.err {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.4;
	}
	.ok {
		color: var(--map-success-text);
	}
	.err {
		color: var(--map-error-text);
		font-weight: 500;
	}
	.log-heading {
		padding: 14px 20px 8px;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.log {
		flex: 1;
		min-height: 160px;
		margin: 0 20px 18px;
		padding: 10px 12px;
		overflow: auto;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-a);
		font: 400 10.5px/1.55 var(--map-font-mono);
		color: var(--map-ink-2);
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Map area + floating overlays, as on the Kartenansicht. */
	.map-area {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
		background: var(--map-bg-surface-muted);
	}
	.pill-bar {
		position: absolute;
		top: 14px;
		left: 16px;
		z-index: 3;
	}
	.status-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(255, 253, 248, 0.94);
		border: 1px solid var(--map-border-strong);
		border-radius: 20px;
		padding: 6px 12px;
		box-shadow: var(--map-shadow-pill);
		font-size: 12px;
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
	}
	.current {
		position: absolute;
		bottom: 16px;
		right: 16px;
		min-width: 150px;
		max-width: 260px;
		background: rgba(255, 253, 248, 0.95);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		padding: 11px 13px;
		box-shadow: var(--map-shadow-overlay);
		z-index: 3;
	}
	.current-name {
		font-size: 12.5px;
		font-weight: 600;
		margin-bottom: 3px;
	}
	.current-code {
		font: 400 11px var(--map-font-mono);
		color: var(--map-ink-muted);
	}

	/* Narrow screens: panel stacks above the map, page scrolls. */
	@media (max-width: 720px) {
		.app {
			height: auto;
			min-height: 100vh;
			overflow: visible;
		}
		.body {
			flex-direction: column;
		}
		.panel {
			flex: none;
			border-right: none;
			border-bottom: 1px solid var(--map-border-strong);
		}
		.map-area {
			flex: none;
			height: 520px;
		}
	}
</style>
