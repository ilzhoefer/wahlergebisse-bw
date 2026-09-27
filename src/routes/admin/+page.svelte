<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
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
		rs?: number;
	}
	interface ProgressState {
		step?: ProgressTick;
		city?: ProgressTick;
		/** Keyed by concurrency slot (0-based) — one bar per worker currently doing station-level work,
		 * always in the same slot regardless of which city that worker is currently on. */
		stations: Record<number, ProgressTick>;
		family?: ProgressTick;
	}

	interface LogEntry {
		t: string | null;
		level: 'info' | 'warn' | 'ok';
		text: string;
	}

	interface CrawlState {
		runId: number;
		date: string;
		electionType: number;
		status: Status;
		log: LogEntry[];
		error: string | null;
		startedAt: string;
		finishedAt: string | null;
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

	let electionTypeId = $state(
		data.lastRun?.electionType ?? data.electionTypes[0]?.electionType ?? 0
	);
	// For Bürgermeisterwahl/Bürgerentscheid (see citySpecificTypes), the city is picked first and the
	// date dropdown is scoped to that city — every other Wahlart shares one statewide date, so there's no
	// city to pick and the date dropdown is just scoped to the Wahlart. `initialCityRs` restores the
	// previous run's city (if any) by finding which city's date list contains its date — crawl_run itself
	// doesn't store rs, so this is the only way to recover it after a reload.
	function initialCityRs(): number | null {
		const lastType = data.lastRun?.electionType;
		const lastDate = data.lastRun?.date;
		if (lastType === undefined || lastDate === undefined) return null;
		const cityList = data.cityDatesByType[lastType] ?? [];
		return cityList.find((c) => c.dates.includes(lastDate))?.rs ?? null;
	}
	let selectedCityRs = $state<number | null>(initialCityRs());
	let date = $state(data.lastRun?.date ?? '');
	// How many cities the crawl processes concurrently — network-bound work, so this isn't really "one
	// per CPU core", but core count − 1 is still a legible cap on the input (see maxParallelism).
	let parallel = $state(Math.min(4, data.maxParallel));
	// Deletes this election's previously fetched data before re-crawling instead of skipping cities that
	// already look complete — for when the upstream source data changed and needs to actually replace
	// what's stored, not just fill in gaps.
	let fullRun = $state(false);
	let starting = $state(false);
	let startError = $state<string | null>(null);
	let liveState = $state<CrawlState | null>(null);
	let dateDiscoveryState = $state<DateDiscoveryState | null>(null);
	let now = $state(Date.now());
	let logEl = $state<HTMLDivElement>();
	let advancedOpen = $state(false);
	let confirming = $state(false);
	let onlyWarnings = $state(false);

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

	const isDateRefreshRunning = $derived(dateDiscoveryState?.status === 'running');

	// Once a "Termine aktualisieren" run finishes, its results are in `elections` — reload the page's
	// server data (typesToDates/cityDatesByType) so the dropdowns reflect them.
	$effect(() => {
		if (dateDiscoveryState?.status === 'done') invalidateAll();
	});

	const isCitySpecific = $derived(data.citySpecificTypes.includes(electionTypeId));
	const citiesForType = $derived(data.cityDatesByType[electionTypeId] ?? []);
	// Normalized to the same shape either way: city-specific dates are inherently single-city already
	// (no need to name it again), so they carry no cityNames annotation.
	const availableDates = $derived(
		isCitySpecific
			? (citiesForType.find((c) => c.rs === selectedCityRs)?.dates ?? []).map((date) => ({
					date,
					cityCount: 1,
					cityNames: [] as string[],
					withData: null as number | null
				}))
			: (data.typesToDates[electionTypeId] ?? [])
	);

	// Keep the city selection valid as the Wahlart changes — reset to the first available city whenever
	// switching to/within a city-specific Wahlart with a no-longer-valid (or no) city selected.
	$effect(() => {
		if (!isCitySpecific || citiesForType.length === 0) {
			selectedCityRs = null;
			return;
		}
		if (!citiesForType.some((c) => c.rs === selectedCityRs)) {
			selectedCityRs = citiesForType[0].rs;
		}
	});

	// Keep the date selection valid as the Wahlart (and, for city-specific types, the city) changes.
	$effect(() => {
		if (availableDates.length === 0) {
			date = '';
			return;
		}
		if (!availableDates.some((d) => d.date === date)) {
			date = availableDates[0].date;
		}
	});

	// "2024-06-09 · 935 von 945 Gemeinden mit Ergebnissen", or for a one-off date the Gemeinden it
	// covers. City-specific dates (Bürgermeisterwahl etc.) are a single, already-chosen Gemeinde.
	function dateOptionLabel(d: (typeof availableDates)[number]): string {
		if (d.cityNames.length)
			return m.admin_crawl_date_special_note({ date: d.date, cities: d.cityNames.join(', ') });
		if (d.withData === null) return d.date;
		return m.admin_crawl_date_option({
			date: d.date,
			withData: String(d.withData),
			gemeinden: String(d.cityCount)
		});
	}

	function typeLabel(id: number): string {
		return data.electionTypes.find((t) => t.electionType === id)?.electionDescription ?? String(id);
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
		confirming = false;
		startError = null;
		starting = true;
		try {
			const res = await fetch('/admin/crawl', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, electionTypeId, parallel, fullRun })
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
	// fallback has no progress ticks, only the log and each Gemeinde's final status.
	const display = $derived.by(() => {
		if (liveState) {
			const start = new Date(liveState.startedAt).getTime();
			const end = liveState.finishedAt ? new Date(liveState.finishedAt).getTime() : now;
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
				log: data.lastRun.log ?? [],
				error: data.lastRun.error,
				progress: { stations: {} } as ProgressState,
				cityStatus: data.lastRun.cityStatus ?? {},
				hasProgress: false
			};
		}
		return null;
	});
	const running = $derived(display?.status === 'running');

	// Per-Gemeinde tallies for the counters and the overall bar. While running they cover the current
	// step (every step loops over the Gemeinden again); afterwards the whole run.
	const cityCounts = $derived.by(() => {
		const counts = { done: 0, in_progress: 0, skipped: 0 };
		for (const s of Object.values(display?.cityStatus ?? {})) counts[s] += 1;
		return counts;
	});
	const finished = $derived(cityCounts.done + cityCounts.skipped);
	const cityTotal = $derived(
		running
			? (display?.progress.city?.total ?? data.cityTotal)
			: display?.status === 'error'
				? data.cityTotal
				: finished
	);
	const progressPercent = $derived(
		display?.status === 'done'
			? 100
			: cityTotal > 0
				? Math.min(100, Math.round((finished / cityTotal) * 100))
				: 0
	);

	// Gemeinden per minute within the current step — counted from when that step started.
	let stepStartedAt = $state(Date.now());
	let lastStepIndex = -1;
	$effect(() => {
		const index = display?.progress.step?.index ?? -1;
		if (index !== lastStepIndex) {
			lastStepIndex = index;
			stepStartedAt = Date.now();
		}
	});
	const throughput = $derived(
		running && display?.progress.city
			? Math.round(finished / Math.max(0.05, (now - stepStartedAt) / 60000))
			: null
	);

	const COLORS = {
		done: 'var(--map-success-fill)',
		in_progress: 'var(--map-progress-running)',
		skipped: '#6f6658',
		pending: 'var(--map-progress-pending)'
	};
	const counters = $derived([
		{ key: 'done', label: m.admin_map_status_done(), value: cityCounts.done },
		{ key: 'in_progress', label: m.admin_counter_running(), value: cityCounts.in_progress },
		{ key: 'skipped', label: m.admin_map_status_skipped(), value: cityCounts.skipped },
		{
			key: 'pending',
			label: m.admin_counter_open(),
			value: Math.max(0, cityTotal - finished - cityCounts.in_progress)
		}
	] as const);

	const lastRunMatches = $derived(
		display?.status === 'done' && display.electionType === electionTypeId && display.date === date
	);
	const primaryLabel = $derived(
		running
			? m.admin_button_running()
			: fullRun
				? m.admin_button_full()
				: lastRunMatches
					? m.admin_button_again()
					: m.admin_crawl_start_button()
	);
	function onPrimary() {
		if (fullRun) confirming = true;
		else void startCrawl();
	}

	/** "08.03.2026" for an ISO date. */
	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}
	const runLabel = $derived(
		display
			? m.admin_status_pill_meta({
					type: typeLabel(display.electionType),
					date: formatDate(display.date)
				})
			: ''
	);

	// Where the crawl reads from — the per-Gemeinde komm.one pages, or the Statistisches Landesamt CSV.
	const sourceUrl = $derived(
		date
			? (data.statistikBwCsv[date] ??
					`${data.kommOneBase}/wahltermin-${date.replaceAll('-', '')}/{AGS}/`)
			: ''
	);
	const selectedDateOption = $derived(availableDates.find((d) => d.date === date));

	const warningCount = $derived(display?.log.filter((l) => l.level === 'warn').length ?? 0);
	const visibleLog = $derived(
		(display?.log ?? []).filter((l) => !onlyWarnings || l.level !== 'info')
	);
	function formatTime(t: string | null): string {
		return t ? new Date(t).toLocaleTimeString('de-DE') : '';
	}

	$effect(() => {
		void visibleLog;
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
		<span class="spacer"></span>
		<div class="aside">
			<a class="link" href={resolve('/')}>{m.admin_nav_map()}</a>
			<a class="link" href={resolve('/daten')}>{m.nav_daten_export()}</a>
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
						disabled={data.electionTypes.length === 0 || running}
					>
						{#each data.electionTypes as t (t.electionType)}
							<option value={t.electionType}>{t.electionDescription ?? t.electionType}</option>
						{/each}
					</select>
				</label>
				{#if isCitySpecific}
					<label class="field">
						<span class="map-lbl field-label">{m.admin_crawl_city_label()}</span>
						<select
							class="select"
							bind:value={selectedCityRs}
							disabled={citiesForType.length === 0 || running}
						>
							{#if citiesForType.length === 0}
								<option value={null}>{m.admin_crawl_city_placeholder()}</option>
							{/if}
							{#each citiesForType as c (c.rs)}
								<option value={c.rs}>{c.name ?? c.rs}</option>
							{/each}
						</select>
					</label>
				{/if}
				<div class="field">
					<span class="field-top">
						<label class="map-lbl field-label" for="admin-date">{m.admin_crawl_date_label()}</label>
						<button
							type="button"
							class="text-link"
							onclick={refreshDates}
							disabled={starting || running || isDateRefreshRunning}
							>↻ {m.admin_crawl_date_refresh_button()}</button
						>
					</span>
					<select
						id="admin-date"
						class="select select-mono"
						bind:value={date}
						disabled={availableDates.length === 0 || running}
					>
						{#if availableDates.length === 0}
							<option value="">{m.admin_crawl_date_placeholder()}</option>
						{/if}
						{#each availableDates as d (d.date)}
							<option value={d.date}>{dateOptionLabel(d)}</option>
						{/each}
					</select>
					{#if selectedDateOption && selectedDateOption.withData !== null}
						<span class="hint"
							>{m.admin_date_coverage({
								n: String(selectedDateOption.withData),
								total: String(data.cityTotal)
							})}</span
						>
					{/if}
					{#if dateDiscoveryState}
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
					{/if}
				</div>
				{#if sourceUrl}
					<div class="field">
						<span class="map-lbl field-label">{m.admin_source_label()}</span>
						<span class="source" title={sourceUrl}>{sourceUrl}</span>
					</div>
				{/if}

				<button
					type="button"
					class="advanced-toggle"
					aria-expanded={advancedOpen}
					onclick={() => (advancedOpen = !advancedOpen)}
					>{advancedOpen ? '▾' : '▸'}
					{m.admin_advanced({ n: String(parallel) })}{fullRun
						? ` · ${m.admin_advanced_fullrun()}`
						: ''}</button
				>
				{#if advancedOpen}
					<div class="advanced">
						<div class="advanced-row">
							<span class="advanced-label" id="parallel-label"
								>{m.admin_crawl_parallel_label({ max: String(data.maxParallel) })}</span
							>
							<div class="segmented parallel" role="radiogroup" aria-labelledby="parallel-label">
								{#each Array.from({ length: data.maxParallel }, (_, i) => i + 1) as n (n)}
									<button
										type="button"
										role="radio"
										aria-checked={parallel === n}
										class="pill"
										class:active={parallel === n}
										disabled={starting || running}
										onclick={() => (parallel = n)}>{n}</button
									>
								{/each}
							</div>
						</div>
						<label class="checkbox">
							<input
								type="checkbox"
								bind:checked={fullRun}
								disabled={starting || running}
								onchange={() => (confirming = false)}
							/>
							<span class="checkbox-text"
								>{m.admin_crawl_fullrun_label()}<span class="checkbox-hint"
									>{m.admin_crawl_fullrun_hint()}</span
								></span
							>
						</label>
					</div>
				{/if}
			</div>

			<div class="section action">
				{#if confirming}
					<div class="confirm" role="alertdialog" aria-labelledby="confirm-text">
						<span id="confirm-text" class="confirm-text"
							>{m.admin_confirm_text({
								what: `${typeLabel(electionTypeId)} ${date ? formatDate(date) : ''}`
							})}</span
						>
						<div class="confirm-actions">
							<button type="button" class="danger" onclick={startCrawl}
								>{m.admin_confirm_yes()}</button
							>
							<button type="button" class="secondary" onclick={() => (confirming = false)}
								>{m.admin_confirm_no()}</button
							>
						</div>
					</div>
				{/if}
				<button
					type="button"
					class="primary"
					class:is-running={running}
					onclick={onPrimary}
					disabled={starting ||
						running ||
						confirming ||
						isDateRefreshRunning ||
						!date ||
						(isCitySpecific && !selectedCityRs)}
				>
					{primaryLabel}
				</button>
				{#if startError}
					<p class="err">{startError}</p>
				{/if}

				<div class="progress">
					<div class="progress-top">
						<span class="map-lbl" style="color: var(--map-ink)"
							>{running
								? m.admin_progress_title({ done: String(finished), total: String(cityTotal) })
								: display
									? m.admin_progress_last({ what: runLabel })
									: m.admin_progress_none()}</span
						>
						<span class="progress-pct">{display ? `${progressPercent} %` : ''}</span>
					</div>
					<span class="track"
						><span
							class="fill"
							class:done={display?.status === 'done'}
							style="width: {progressPercent}%"
						></span></span
					>
					{#if running && display?.progress.step}
						<span class="step-line"
							>{levelKicker('step')}
							{display.progress.step.index}/{display.progress.step.total} · {display.progress.step
								.label}</span
						>
					{/if}
					<div class="counters">
						{#each counters as c (c.key)}
							<div class="counter">
								<span class="counter-top"
									><span class="swatch" style="background: {COLORS[c.key]}"></span><span
										class="map-lbl counter-label">{c.label}</span
									></span
								>
								<span class="counter-value">{c.value}</span>
							</div>
						{/each}
					</div>
				</div>

				{#if running && Object.keys(display?.progress.stations ?? {}).length > 0}
					<div class="fetches">
						<span class="map-lbl" style="color: var(--map-ink-muted)"
							>{m.admin_fetches_heading()}</span
						>
						{#each Object.entries(display?.progress.stations ?? {}) as [slot, tick] (slot)}
							<div class="fetch">
								<span class="fetch-name">{tick.label}</span>
								<span class="fetch-track"
									><span
										class="fetch-fill"
										style="width: {tick.total ? Math.round((tick.index / tick.total) * 100) : 0}%"
									></span></span
								>
								<span class="fetch-count">{tick.index}/{tick.total}</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if running && display?.progress.family}
					<ProgressBar
						kicker={levelKicker('family')}
						label={display.progress.family.label}
						current={display.progress.family.index}
						total={display.progress.family.total}
					/>
				{/if}

				{#if display?.error}
					<p class="err">{display.error}</p>
				{/if}
			</div>

			<div class="log-heading">
				<span class="map-lbl" style="color: var(--map-ink)">{m.admin_log_heading()}</span>
				{#if display && display.log.length > 0}
					<button
						type="button"
						class="map-lbl warn-toggle"
						class:has-warnings={warningCount > 0}
						aria-pressed={onlyWarnings}
						onclick={() => (onlyWarnings = !onlyWarnings)}
						>{onlyWarnings
							? m.admin_log_show_all({ n: String(display.log.length) })
							: warningCount === 1
								? m.admin_log_warn_filter_one()
								: m.admin_log_warn_filter({ n: String(warningCount) })}</button
					>
				{/if}
			</div>
			<div bind:this={logEl} class="log">
				{#if !display}
					<p class="log-empty">{m.admin_status_none()}<br />{m.admin_status_none_hint()}</p>
				{:else if display.log.length === 0}
					<p class="log-empty">{m.admin_status_log_waiting()}</p>
				{:else}
					{#each visibleLog as entry, i (i)}
						<div class="log-row">
							<span class="log-time">{formatTime(entry.t)}</span>
							<span class="log-text {entry.level}">{entry.text}</span>
						</div>
					{/each}
				{/if}
			</div>
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
					{#if display}
						{runLabel}
						<span class="pill-status"
							>· {durationLabel(display.status, formatDuration(display.durationMs))}</span
						>
					{:else}
						{m.admin_status_idle()}
					{/if}
				</span>
				{#if throughput !== null}
					<span class="map-lbl throughput">{m.admin_throughput({ n: String(throughput) })}</span>
				{/if}
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
	.spacer {
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
	.field-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.field-label {
		color: var(--map-ink);
	}
	.text-link {
		font: 500 11.5px var(--map-font-body);
		color: var(--map-accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.text-link:hover:not(:disabled) {
		color: var(--map-accent-hover);
	}
	.text-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.hint {
		font-size: 11.5px;
		color: var(--map-ink-muted);
	}
	.source {
		padding: 8px 10px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-a);
		font: 400 11.5px var(--map-font-mono);
		color: var(--map-ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.advanced-toggle {
		align-self: flex-start;
		font: 500 12px var(--map-font-body);
		color: var(--map-ink-2);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.advanced {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--map-border-soft);
		border-radius: 7px;
		background: var(--map-bg-list-b);
	}
	.advanced-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 10px;
	}
	.advanced-label {
		font-size: 12.5px;
		font-weight: 500;
	}
	.pill:disabled {
		cursor: not-allowed;
	}
	.parallel {
		/* the cap is the server's core count − 1, which can exceed one row */
		flex-wrap: wrap;
	}
	.checkbox {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-ink);
		cursor: pointer;
	}
	.checkbox input {
		accent-color: var(--map-accent);
		margin: 2px 0 0;
	}
	.checkbox-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.checkbox-hint {
		font-size: 11.5px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--map-ink-3);
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 11px 12px;
		border: 1px solid var(--map-warning-border);
		border-radius: 7px;
		background: var(--map-warning-bg);
	}
	.confirm-text {
		font-size: 12px;
		line-height: 1.45;
		color: var(--map-warning-text);
	}
	.confirm-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.danger {
		padding: 8px 12px;
		border-radius: 6px;
		border: 1px solid var(--map-warning-text);
		background: var(--map-warning-text);
		color: var(--map-bg-surface);
		font: 600 12.5px var(--map-font-body);
		cursor: pointer;
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
	.primary.is-running:disabled {
		opacity: 1;
		cursor: progress;
	}
	.progress {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.progress-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.progress-pct {
		font: 500 11.5px var(--map-font-mono);
	}
	.track {
		display: block;
		height: 7px;
		border-radius: 4px;
		background: var(--map-bg-surface-sunken);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--map-accent);
		transition: width 0.3s linear;
	}
	.fill.done {
		background: var(--map-success-fill);
	}
	.step-line {
		font-size: 11.5px;
		color: var(--map-ink-3);
	}
	.counters {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		margin-top: 4px;
	}
	.counter {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 7px 8px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-b);
	}
	.counter-top {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
	}
	.counter-label {
		color: var(--map-ink-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.counter-value {
		font: 500 14px var(--map-font-mono);
		color: var(--map-ink);
	}
	.swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex: none;
	}
	.fetches {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.fetch {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 60px 52px;
		align-items: center;
		gap: 8px;
	}
	.fetch-name {
		font-size: 11.5px;
		color: var(--map-ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.fetch-track {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--map-bg-surface-sunken);
		overflow: hidden;
	}
	.fetch-fill {
		display: block;
		height: 100%;
		background: var(--map-progress-running);
	}
	.fetch-count {
		font: 400 10.5px var(--map-font-mono);
		color: var(--map-ink-muted);
		text-align: right;
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
	.warn-toggle {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--map-ink-muted);
	}
	.warn-toggle.has-warnings {
		color: var(--map-error-text);
	}
	.log {
		flex: 1;
		min-height: 160px;
		margin: 0 20px 18px;
		padding: 8px 0;
		overflow: auto;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-b);
	}
	.log-row {
		display: grid;
		grid-template-columns: 58px minmax(0, 1fr);
		gap: 6px;
		padding: 3px 12px;
	}
	.log-time {
		font: 400 10.5px/1.6 var(--map-font-mono);
		color: var(--map-ink-muted);
	}
	.log-text {
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--map-ink-2);
		overflow-wrap: anywhere;
	}
	.log-text.warn {
		color: var(--map-error-text);
		font-weight: 500;
	}
	.log-text.ok {
		color: var(--map-success-text);
		font-weight: 500;
	}
	.log-empty {
		margin: 0;
		padding: 4px 12px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--map-ink-muted);
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
		right: 60px;
		z-index: 3;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 10px;
		pointer-events: none;
	}
	.pill-status {
		font-weight: 500;
		color: var(--map-ink-muted);
	}
	.throughput {
		color: var(--map-ink-2);
		background: rgba(255, 253, 248, 0.9);
		padding: 5px 8px;
		border-radius: 5px;
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
