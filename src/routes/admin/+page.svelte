<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';

	let { data }: { data: PageData } = $props();

	interface CrawlState {
		runId: number;
		date: string;
		electionType: number;
		status: 'running' | 'done' | 'error';
		log: string[];
		error: string | null;
	}

	interface DateDiscoveryState {
		status: 'running' | 'done' | 'error';
		log: string[];
		dates: string[];
		error: string | null;
	}

	let date = $state(data.lastRun?.date ?? data.knownDates[0] ?? '');
	let electionTypeId = $state(
		data.lastRun?.electionType ?? data.electionTypes[0]?.electionType ?? 0
	);
	let starting = $state(false);
	let startError = $state<string | null>(null);
	let liveState = $state<CrawlState | null>(null);
	let dateDiscoveryState = $state<DateDiscoveryState | null>(null);

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
		return () => {
			crawlSource.close();
			datesSource.close();
		};
	});

	const isRunning = $derived(liveState?.status === 'running');
	const isDateRefreshRunning = $derived(dateDiscoveryState?.status === 'running');

	// Once a "Termine aktualisieren" run finishes, its results are in `elections` — reload the page's
	// server data (knownDates/datesToTypes) so the dropdowns reflect them.
	$effect(() => {
		if (dateDiscoveryState?.status === 'done') invalidateAll();
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

	function statusLabel(status: 'running' | 'done' | 'error'): string {
		switch (status) {
			case 'running':
				return m.admin_status_running();
			case 'done':
				return m.admin_status_done();
			case 'error':
				return m.admin_status_error();
		}
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
</script>

<div class="mx-auto max-w-3xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold">{m.admin_title()}</h1>
		<form method="POST" action="/admin/logout">
			<button type="submit" class="text-sm text-blue-700 underline">{m.admin_logout()}</button>
		</form>
	</div>

	<section class="space-y-3 rounded border p-4">
		<h2 class="font-medium">{m.admin_crawl_start_heading()}</h2>
		<div class="flex flex-wrap items-end gap-3">
			<label class="text-sm">
				{m.admin_crawl_date_label()}
				<div class="mt-1 flex items-center gap-2">
					<select
						bind:value={date}
						disabled={data.knownDates.length === 0}
						class="rounded border p-1"
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
						class="rounded border px-2 py-1 text-xs font-medium disabled:opacity-50"
					>
						{m.admin_crawl_date_refresh_button()}
					</button>
				</div>
			</label>
			<label class="text-sm">
				{m.admin_crawl_electiontype_label()}
				<select
					bind:value={electionTypeId}
					disabled={filteredElectionTypes.length === 0}
					class="mt-1 block rounded border p-1"
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
				class="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
			>
				{m.admin_crawl_start_button()}
			</button>
		</div>
		{#if isDateRefreshRunning}
			<p class="text-xs text-gray-600">{m.admin_crawl_date_refresh_running()}</p>
		{:else if dateDiscoveryState?.status === 'done'}
			<p class="text-xs text-gray-600">
				{m.admin_crawl_date_refresh_done({ count: String(dateDiscoveryState.dates.length) })}
			</p>
		{:else if dateDiscoveryState?.status === 'error'}
			<p class="text-xs text-red-600">{dateDiscoveryState.error}</p>
		{/if}
		{#if startError}
			<p class="text-sm text-red-600">{startError}</p>
		{/if}
	</section>

	<section class="space-y-2 rounded border p-4">
		<h2 class="font-medium">{m.admin_status_heading()}</h2>
		{#if liveState}
			<p class="text-sm">
				{m.admin_status_current({
					type: typeLabel(liveState.electionType),
					date: liveState.date,
					status: statusLabel(liveState.status)
				})}
			</p>
			{#if liveState.error}
				<p class="text-sm text-red-600">{liveState.error}</p>
			{/if}
			<pre
				class="max-h-96 overflow-y-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{liveState.log.join(
					'\n'
				)}</pre>
		{:else if data.lastRun}
			<p class="text-sm">
				{m.admin_status_last_run({
					type: typeLabel(data.lastRun.electionType),
					date: data.lastRun.date,
					status: statusLabel(data.lastRun.status as 'running' | 'done' | 'error')
				})}
			</p>
			{#if data.lastRun.log}
				<pre class="max-h-96 overflow-y-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{data
						.lastRun.log}</pre>
			{/if}
		{:else}
			<p class="text-sm text-gray-600">{m.admin_status_none()}</p>
		{/if}
	</section>
</div>
