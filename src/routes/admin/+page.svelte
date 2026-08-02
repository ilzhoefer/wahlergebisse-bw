<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';

	let { data }: { data: PageData } = $props();

	type Status = 'running' | 'done' | 'error';

	interface ProgressTick {
		level: 'step' | 'city' | 'station';
		index: number;
		total: number;
		label: string;
	}
	interface ProgressState {
		step?: ProgressTick;
		city?: ProgressTick;
		station?: ProgressTick;
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
	}

	interface DateDiscoveryState {
		status: Status;
		log: string[];
		dates: string[];
		error: string | null;
		startedAt: string;
		progress: ProgressState;
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
	let logExpanded = $state(false);
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

	$effect(() => {
		if (liveState?.status === 'error') logExpanded = true;
	});

	// Which Wahlarten actually exist on the selected date, per data already loaded from `elections` —
	// no live lookup needed. Falls back to showing every known type for a date with no classified
	// elections yet (e.g. one just discovered but never crawled).
	const typesForDate = $derived(data.datesToTypes[date] ?? null);
	const filteredElectionTypes = $derived(
		typesForDate
			? data.electionTypes.filter((t) => typesForDate.includes(t.electionType))
			: data.electionTypes
	);

	// Keep the Wahlart selection valid as the date (and therefore the filtered list) changes.
	$effect(() => {
		if (filteredElectionTypes.length === 0) return;
		if (!filteredElectionTypes.some((t) => t.electionType === electionTypeId)) {
			electionTypeId = filteredElectionTypes[0].electionType;
		}
	});

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
				hasProgress: false
			};
		}
		return null;
	});

	$effect(() => {
		void display?.log;
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	});
</script>

<div class="min-h-screen bg-gray-50">
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
		<div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-3">
				<h1 class="text-xl font-semibold text-gray-900">{m.admin_title()}</h1>
				{#if isRunning}
					<StatusBadge status="running" label={statusLabel('running')} />
				{/if}
			</div>
			<form method="POST" action="/admin/logout">
				<button type="submit" class="text-sm text-blue-700 underline">{m.admin_logout()}</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-3xl space-y-6 p-6">
		<section class="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<h2 class="font-medium text-gray-900">{m.admin_crawl_start_heading()}</h2>
			<div class="flex flex-wrap items-end gap-3">
				<label class="text-sm text-gray-700">
					{m.admin_crawl_date_label()}
					<div class="mt-1 flex items-center gap-2">
						<select
							bind:value={date}
							disabled={data.knownDates.length === 0}
							class="rounded-lg border border-gray-300 p-1.5 text-sm"
						>
							{#if data.knownDates.length === 0}
								<option value="">{m.admin_crawl_date_placeholder()}</option>
							{/if}
							{#each data.knownDates as d (d)}
								<option value={d}>{d}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={refreshDates}
							disabled={starting || isRunning || isDateRefreshRunning}
							class="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
						>
							{m.admin_crawl_date_refresh_button()}
						</button>
					</div>
				</label>
				<label class="text-sm text-gray-700">
					{m.admin_crawl_electiontype_label()}
					<select
						bind:value={electionTypeId}
						disabled={filteredElectionTypes.length === 0}
						class="mt-1 block rounded-lg border border-gray-300 p-1.5 text-sm"
					>
						{#if filteredElectionTypes.length === 0}
							<option value="">{m.admin_crawl_electiontype_placeholder()}</option>
						{/if}
						{#each filteredElectionTypes as t (t.electionType)}
							<option value={t.electionType}>{t.electionDescription ?? t.electionType}</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					onclick={startCrawl}
					disabled={starting ||
						isRunning ||
						isDateRefreshRunning ||
						!date ||
						filteredElectionTypes.length === 0}
					class="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
				>
					{#if starting}
						<svg
							class="h-3.5 w-3.5 animate-spin"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path>
						</svg>
					{/if}
					{m.admin_crawl_start_button()}
				</button>
			</div>

			{#if dateDiscoveryState}
				<div class="space-y-2 rounded-lg bg-gray-50 p-3">
					<div class="flex items-center justify-between gap-3">
						<StatusBadge
							status={dateDiscoveryState.status}
							label={statusLabel(dateDiscoveryState.status)}
						/>
						{#if dateDiscoveryState.status === 'done'}
							<span class="text-xs text-gray-600">
								{m.admin_crawl_date_refresh_done({
									count: String(dateDiscoveryState.dates.length)
								})}
							</span>
						{/if}
					</div>
					{#if dateDiscoveryState.status === 'running'}
						<div class="space-y-2">
							{#if dateDiscoveryState.progress.step}
								<ProgressBar
									kicker={levelKicker('step')}
									label={dateDiscoveryState.progress.step.label}
									current={dateDiscoveryState.progress.step.index}
									total={dateDiscoveryState.progress.step.total}
									tone="running"
								/>
							{/if}
							{#if dateDiscoveryState.progress.city}
								<ProgressBar
									kicker={levelKicker('city')}
									label={dateDiscoveryState.progress.city.label}
									current={dateDiscoveryState.progress.city.index}
									total={dateDiscoveryState.progress.city.total}
									tone="running"
								/>
							{/if}
						</div>
					{/if}
					{#if dateDiscoveryState.status === 'error'}
						<p class="text-xs text-red-600">{dateDiscoveryState.error}</p>
					{/if}
				</div>
			{/if}

			{#if startError}
				<p class="text-sm text-red-600">{startError}</p>
			{/if}
		</section>

		<section class="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<h2 class="font-medium text-gray-900">{m.admin_status_heading()}</h2>

			{#if display}
				<div class="flex flex-wrap items-center gap-3">
					<StatusBadge status={display.status} label={statusLabel(display.status)} />
					<span class="text-xs text-gray-500 tabular-nums">
						{durationLabel(display.status, formatDuration(display.durationMs))}
					</span>
				</div>
				<p class="text-sm text-gray-600">
					{m.admin_status_meta({ type: typeLabel(display.electionType), date: display.date })}
				</p>

				{#if display.hasProgress && display.status === 'running'}
					<div class="space-y-3 rounded-lg bg-gray-50 p-3">
						{#if display.progress.step}
							<ProgressBar
								kicker={levelKicker('step')}
								label={display.progress.step.label}
								current={display.progress.step.index}
								total={display.progress.step.total}
								tone="running"
							/>
						{/if}
						{#if display.progress.city}
							<ProgressBar
								kicker={levelKicker('city')}
								label={display.progress.city.label}
								current={display.progress.city.index}
								total={display.progress.city.total}
								tone="running"
							/>
						{/if}
						{#if display.progress.station}
							<ProgressBar
								kicker={levelKicker('station')}
								label={display.progress.station.label}
								current={display.progress.station.index}
								total={display.progress.station.total}
								tone="running"
							/>
						{/if}
					</div>
				{/if}

				{#if display.error}
					<p class="text-sm text-red-600">{display.error}</p>
				{/if}

				<div>
					<button
						type="button"
						class="text-xs text-blue-700 underline"
						onclick={() => (logExpanded = !logExpanded)}
					>
						{logExpanded ? m.admin_status_log_hide() : m.admin_status_log_show()}
					</button>
					{#if logExpanded}
						<pre
							bind:this={logEl}
							class="mt-2 max-h-96 overflow-y-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{display
								.log.length
								? display.log.join('\n')
								: m.admin_status_log_waiting()}</pre>
					{/if}
				</div>
			{:else}
				<div class="py-8 text-center">
					<p class="text-sm text-gray-600">{m.admin_status_none()}</p>
					<p class="mt-1 text-xs text-gray-400">{m.admin_status_none_hint()}</p>
				</div>
			{/if}
		</section>
	</div>
</div>
