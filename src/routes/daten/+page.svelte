<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import type { FeatureCollection } from 'geojson';
	import * as m from '$lib/paraglide/messages';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SiteLinks from '$lib/components/SiteLinks.svelte';
	import { GEO_URL } from '$lib/map/geoUrls';
	import { rsPrefix } from '$lib/map/rs';
	import { EXPORT_FILES } from '$lib/csv-export/files';

	let { data } = $props();

	// ---- Election ---------------------------------------------------------------------------------
	const electionKey = (e: { electionType: number; date: string }) => `${e.electionType}|${e.date}`;
	let selectedElectionKey = $state(data.elections[0] ? electionKey(data.elections[0]) : '');
	const selectedElection = $derived(
		data.elections.find((e) => electionKey(e) === selectedElectionKey)
	);

	// ---- Gemeinde picker: Baden-Württemberg → Regierungsbezirk → Kreis → Gemeinde ------------------
	type City = (typeof data.cities)[number];
	const picked = new SvelteSet<number>(data.cities.map((c) => c.rs));

	// Kreis/RB names come from the boundary files the map uses (same cached asset), keyed by rs prefix.
	let groupNames = $state<Record<string, string>>({});
	onMount(() => {
		Promise.all(
			[GEO_URL.regierungsbezirk, GEO_URL.kreis].map((url) =>
				fetch(url).then((r) => r.json() as Promise<FeatureCollection>)
			)
		).then(([rb, kreis]) => {
			const names: Record<string, string> = {};
			for (const f of rb.features)
				names[rsPrefix(Number(f.properties?.rs), 2)] = f.properties?.name;
			for (const f of kreis.features)
				names[rsPrefix(Number(f.properties?.rs), 4)] = f.properties?.name;
			groupNames = names;
		});
	});

	interface KreisGroup {
		key: string;
		cities: City[];
	}
	interface RbGroup {
		key: string;
		kreise: KreisGroup[];
		cities: City[];
	}
	const tree = $derived.by(() => {
		const rbs: Record<string, Record<string, City[]>> = {};
		for (const c of data.cities)
			((rbs[rsPrefix(c.rs, 2)] ??= {})[rsPrefix(c.rs, 4)] ??= []).push(c);
		return Object.entries(rbs)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, kreise]): RbGroup => ({
				key,
				kreise: Object.entries(kreise)
					.map(([k, cities]) => ({ key: k, cities }))
					.sort((a, b) => nameOf(a.key).localeCompare(nameOf(b.key))),
				cities: Object.values(kreise).flat()
			}));
	});
	function nameOf(prefix: string): string {
		return groupNames[prefix] ?? prefix;
	}

	let filter = $state('');
	const query = $derived(filter.trim().toLowerCase());
	function matches(c: City): boolean {
		if (!query) return true;
		return [c.name ?? '', nameOf(rsPrefix(c.rs, 4)), nameOf(rsPrefix(c.rs, 2))].some((n) =>
			n.toLowerCase().includes(query)
		);
	}

	// RBs start open, Kreise closed; while filtering, every group with a match opens.
	const expanded = new SvelteSet<string>();
	let expandedInit = false;
	$effect(() => {
		if (expandedInit || tree.length === 0) return;
		expandedInit = true;
		for (const rb of tree) expanded.add(rb.key);
	});
	function isOpen(key: string): boolean {
		return !!query || expanded.has(key);
	}
	function toggleOpen(key: string) {
		if (expanded.has(key)) expanded.delete(key);
		else expanded.add(key);
	}

	type TriState = 'all' | 'some' | 'none';
	function stateOf(cities: City[]): TriState {
		const n = cities.filter((c) => picked.has(c.rs)).length;
		return n === 0 ? 'none' : n === cities.length ? 'all' : 'some';
	}
	function countOf(cities: City[]): string {
		return `${cities.filter((c) => picked.has(c.rs)).length}/${cities.length}`;
	}
	function setMany(cities: City[], on: boolean) {
		for (const c of cities) {
			if (on) picked.add(c.rs);
			else picked.delete(c.rs);
		}
	}
	/** Native tri-state: `indeterminate` is a DOM property only, never an attribute. */
	function triState(state: TriState) {
		return (el: HTMLInputElement) => {
			el.indeterminate = state === 'some';
		};
	}

	const pickedList = $derived(data.cities.filter((c) => picked.has(c.rs)));
	const kreiseTouched = $derived(new Set(pickedList.map((c) => rsPrefix(c.rs, 4))).size);

	// ---- Data types -------------------------------------------------------------------------------
	let wantMeta = $state(true);
	let wantAggregate = $state(true);
	let wantPs = $state(true);
	let wantMetaPs = $state(true);
	let person = $state(true);
	const byCandidate = $derived(!!selectedElection?.supportsPersonToggle && person);

	const kinds = $derived([
		{ name: 'meta', label: m.daten_meta_label(), file: EXPORT_FILES.meta, on: wantMeta },
		{
			name: 'aggregate',
			label: m.daten_aggregate_label(),
			file: EXPORT_FILES.aggregate,
			on: wantAggregate
		},
		{
			name: 'ps',
			label: m.daten_ps_label(),
			file: byCandidate ? EXPORT_FILES.psByCandidate : EXPORT_FILES.psByParty,
			on: wantPs
		},
		{ name: 'metaPs', label: m.daten_meta_ps_label(), file: EXPORT_FILES.metaPs, on: wantMetaPs }
	]);
	function toggleKind(name: string) {
		if (name === 'meta') wantMeta = !wantMeta;
		else if (name === 'aggregate') wantAggregate = !wantAggregate;
		else if (name === 'ps') wantPs = !wantPs;
		else wantMetaPs = !wantMetaPs;
	}
	const chosen = $derived(kinds.filter((k) => k.on));

	// Preview: the first chosen file's real columns; rows name the first picked Gemeinden, the values
	// themselves are only known once the export runs.
	const preview = $derived(chosen[0]?.file ?? null);
	const previewRows = $derived(pickedList.slice(0, 4));
	function previewCell(column: string, c: City): string {
		if (column === 'rs') return String(c.rs); // as in the CSV: no leading 0
		if (column === 'cityName') return c.name ?? '';
		return '…';
	}

	// ---- Download ---------------------------------------------------------------------------------
	let busy = $state(false);
	let failed = $state<string | null>(null);
	const blocked = $derived(
		pickedList.length === 0
			? m.daten_cta_no_gemeinden()
			: chosen.length === 0
				? m.daten_cta_no_kinds()
				: null
	);

	/** Same form payload as a plain submit; fetched so the button can show progress. */
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (blocked || busy) return;
		const form = e.currentTarget as HTMLFormElement;
		busy = true;
		failed = null;
		try {
			// URLSearchParams → urlencoded, exactly what the native form submit sends.
			const body = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
			const res = await fetch(form.action, { method: 'POST', body });
			if (!res.ok) {
				failed = m.daten_cta_error({ status: String(res.status) });
				return;
			}
			const name =
				/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
				'wahlergebnisse.zip';
			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = name;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			failed = m.daten_cta_error({ status: '–' });
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{m.daten_title()}</title>
</svelte:head>

<div class="map-root page">
	<SiteHeader kicker={m.daten_title()}>
		<label class="election">
			<span class="map-lbl" style="color: var(--map-ink-muted)">{m.daten_wahl_label()}</span>
			<select class="select" bind:value={selectedElectionKey}>
				{#each data.elections as e (electionKey(e))}
					<option value={electionKey(e)}>{e.label}</option>
				{/each}
			</select>
		</label>
	</SiteHeader>

	<form method="POST" action="/daten/export" class="body" onsubmit={submit}>
		<input type="hidden" name="electionType" value={selectedElection?.electionType ?? ''} />
		<input type="hidden" name="date" value={selectedElection?.date ?? ''} />
		{#each pickedList as c (c.rs)}
			<input type="hidden" name="rs" value={c.rs} />
		{/each}

		<section class="picker">
			<div class="picker-head">
				<span class="map-lbl" style="color: var(--map-ink)">{m.daten_gemeinden_legend()}</span>
				<span class="spacer"></span>
				<span class="count-line"
					>{m.daten_picked_count({
						n: String(pickedList.length),
						total: String(data.cities.length)
					})}</span
				>
				<button type="button" class="link" onclick={() => setMany(data.cities, true)}
					>{m.daten_all()}</button
				>
				<button type="button" class="link" onclick={() => picked.clear()}>{m.daten_clear()}</button>
			</div>
			<div class="filter">
				<input
					type="search"
					class="input"
					bind:value={filter}
					placeholder={m.daten_filter_placeholder()}
					aria-label={m.daten_filter_placeholder()}
				/>
			</div>

			{@render row({
				level: 'land',
				key: 'land',
				name: m.map_brand_region(),
				cities: data.cities
			})}
			<div class="tree">
				{#each tree as rb (rb.key)}
					{#if rb.cities.some(matches)}
						{@render row({ level: 'rb', key: rb.key, name: nameOf(rb.key), cities: rb.cities })}
						{#if isOpen(rb.key)}
							{#each rb.kreise as kr (kr.key)}
								{#if kr.cities.some(matches)}
									{@render row({
										level: 'kreis',
										key: kr.key,
										name: nameOf(kr.key),
										cities: kr.cities
									})}
									{#if isOpen(kr.key)}
										{#each kr.cities.filter(matches) as c (c.rs)}
											<label class="row gemeinde" class:on={picked.has(c.rs)}>
												<input
													type="checkbox"
													checked={picked.has(c.rs)}
													onchange={() => setMany([c], !picked.has(c.rs))}
												/>
												<span class="row-name">{c.name}</span>
												<span class="row-meta">{String(c.rs).padStart(12, '0')}</span>
											</label>
										{/each}
									{/if}
								{/if}
							{/each}
						{/if}
					{/if}
				{/each}
				{#if !data.cities.some(matches)}
					<p class="empty">{m.map_search_no_results()}</p>
				{/if}
			</div>
		</section>

		<section class="side">
			<div class="side-main">
				<div class="group">
					<span class="map-lbl" style="color: var(--map-ink)">{m.daten_datenarten_legend()}</span>
					{#each kinds as k (k.name)}
						<label class="kind" class:on={k.on}>
							<input
								type="checkbox"
								name={k.name}
								checked={k.on}
								onchange={() => toggleKind(k.name)}
							/>
							<span class="kind-text">
								<span class="kind-label">{k.label}</span>
								<span class="kind-file">{k.file.name}</span>
							</span>
						</label>
						{#if k.name === 'ps' && wantPs && selectedElection?.supportsPersonToggle}
							<label class="sub">
								<input type="checkbox" name="person" bind:checked={person} />
								<span>{m.daten_person_label()}</span>
							</label>
						{/if}
					{/each}
				</div>

				<div class="group">
					<span class="map-lbl" style="color: var(--map-ink)">{m.daten_summary_heading()}</span>
					<div class="summary-row">
						<span class="map-lbl" style="color: var(--map-ink-muted)"
							>{m.daten_gemeinden_legend()}</span
						>
						<span class="summary-value"
							>{pickedList.length ? pickedList.length : m.daten_summary_none()}</span
						>
					</div>
					<div class="summary-row">
						<span class="map-lbl" style="color: var(--map-ink-muted)"
							>{m.daten_summary_kreise()}</span
						>
						<span class="summary-value">{pickedList.length ? kreiseTouched : '—'}</span>
					</div>
					<div class="summary-row">
						<span class="map-lbl" style="color: var(--map-ink-muted)"
							>{m.daten_summary_files()}</span
						>
						<span class="summary-value"
							>{chosen.length === 0
								? '—'
								: chosen.length === 1
									? m.daten_summary_files_value({ n: '1' })
									: m.daten_summary_files_zip({ n: String(chosen.length) })}</span
						>
					</div>
				</div>

				{#if preview && previewRows.length > 0}
					<div class="preview">
						<div class="preview-head">
							<span class="map-lbl" style="color: var(--map-ink)"
								>{m.daten_preview({ file: preview.name })}</span
							>
							<span class="spacer"></span>
							<span class="map-lbl" style="color: var(--map-ink-muted)"
								>{m.daten_preview_cols({ n: String(preview.columns.length) })}</span
							>
						</div>
						<div class="preview-scroll">
							<table>
								<thead>
									<tr>
										{#each preview.columns as col (col)}
											<th>{col}</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each previewRows as c (c.rs)}
										<tr>
											{#each preview.columns as col (col)}
												<td>{previewCell(col, c)}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>

			<div class="cta">
				<button type="submit" class="primary" disabled={!!blocked || busy} aria-busy={busy}
					>{busy
						? m.daten_cta_loading()
						: (blocked ??
							(chosen.length === 1
								? m.daten_cta_one()
								: m.daten_cta_many({ n: String(chosen.length) })))}</button
				>
				{#if failed}
					<span class="error" role="alert">{failed}</span>
				{/if}
				<p class="disclaimer">{m.about_disclaimer()}</p>
				<span class="cta-note"
					>{m.daten_cta_note()}
					<a href={resolve('/datenformat')}>{m.datenformat_download_link()} →</a></span
				>
			</div>
		</section>
	</form>

	<SiteLinks class="page-links" />
</div>

{#snippet row(g: { level: 'land' | 'rb' | 'kreis'; key: string; name: string; cities: City[] })}
	{@const st = stateOf(g.cities)}
	<div class="row {g.level}" class:on={st !== 'none'}>
		{#if g.level !== 'land'}
			<button
				type="button"
				class="chevron"
				aria-expanded={isOpen(g.key)}
				aria-label={isOpen(g.key) ? m.daten_collapse() : m.daten_expand()}
				disabled={!!query}
				onclick={() => toggleOpen(g.key)}>{isOpen(g.key) ? '▾' : '▸'}</button
			>
		{/if}
		<label class="row-label">
			<input
				type="checkbox"
				checked={st === 'all'}
				{@attach triState(st)}
				onchange={() => setMany(g.cities, st !== 'all')}
			/>
			<span class="row-name">{g.name}</span>
		</label>
		<span class="row-meta">{countOf(g.cities)}</span>
	</div>
{/snippet}

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		color: var(--map-ink);
	}
	.election {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.select {
		padding: 6px 9px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font: 600 12.5px var(--map-font-body);
		color: var(--map-ink);
		cursor: pointer;
		max-width: 100%;
	}
	.body {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		min-height: 0;
	}
	.spacer {
		flex: 1;
	}
	input[type='checkbox'] {
		width: 15px;
		height: 15px;
		margin: 0;
		flex: none;
		accent-color: var(--map-accent);
		cursor: pointer;
	}

	/* ---- picker ---- */
	.picker {
		flex: 1 1 430px;
		min-width: 0;
		background: var(--map-bg-surface);
		border-right: 1px solid var(--map-border-strong);
		display: flex;
		flex-direction: column;
	}
	.picker-head {
		padding: 14px 18px 11px;
		border-bottom: 1px solid var(--map-border-soft);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 10px;
	}
	.count-line {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--map-ink-muted);
	}
	.link {
		font: 500 11.5px var(--map-font-body);
		color: var(--map-accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.link:hover {
		color: var(--map-accent-hover);
	}
	.filter {
		padding: 10px 18px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		padding: 7px 10px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font: 400 13px var(--map-font-body);
		color: var(--map-ink);
		outline-color: var(--map-accent);
	}
	.tree {
		flex: 1;
		min-height: 300px;
		max-height: 560px;
		overflow-y: auto;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		user-select: none;
	}
	.row-label {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}
	.row-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12.5px;
	}
	.row-meta {
		flex: none;
		font: 400 10.5px var(--map-font-mono);
		color: var(--map-ink-muted);
	}
	.chevron {
		width: 16px;
		flex: none;
		padding: 0;
		border: none;
		background: none;
		font-size: 11px;
		color: var(--map-ink-muted);
		cursor: pointer;
	}
	.chevron:disabled {
		cursor: default;
	}
	.row.land {
		padding: 11px 18px;
		border-bottom: 1px solid var(--map-border-strong);
	}
	.row.land.on {
		background: var(--map-bg-selected-tint);
	}
	.row.land .row-name {
		font-size: 13px;
		font-weight: 600;
	}
	.row.rb {
		padding: 9px 18px;
		background: var(--map-bg-list-a);
		border-bottom: 1px solid var(--map-border-soft);
	}
	.row.rb .row-name {
		font-weight: 600;
	}
	.row.kreis {
		padding: 8px 18px 8px 32px;
		background: var(--map-bg-list-b);
		border-bottom: 1px solid var(--map-border-faint);
	}
	.row.kreis .row-name {
		font-weight: 600;
		color: var(--map-ink-2);
	}
	.row.gemeinde {
		padding: 7px 18px 7px 74px;
		border-bottom: 1px solid var(--map-border-faint-2);
		cursor: pointer;
	}
	.row.gemeinde.on {
		background: var(--map-bg-selected-tint-2);
	}
	.row.gemeinde .row-name {
		font-weight: 500;
	}
	.empty {
		margin: 0;
		padding: 14px 18px;
		font-size: 12px;
		color: var(--map-ink-muted);
	}

	/* ---- right column ---- */
	.side {
		flex: 1 1 360px;
		min-width: 0;
		background: var(--map-bg-surface-muted);
		display: flex;
		flex-direction: column;
	}
	.side-main {
		flex: 1;
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.kind {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: var(--map-bg-surface);
		cursor: pointer;
		user-select: none;
	}
	.kind.on {
		border-color: var(--map-accent);
		background: var(--map-bg-selected-tint);
	}
	.kind-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.kind-label {
		font-size: 12.5px;
		font-weight: 600;
	}
	.kind-file {
		font: 400 10.5px var(--map-font-mono);
		color: var(--map-ink-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 2px 12px 4px 38px;
		font-size: 12px;
		color: var(--map-ink-2);
		cursor: pointer;
	}
	.summary-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 8px 12px;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
	}
	.summary-value {
		margin-left: auto;
		font-size: 12.5px;
		font-weight: 500;
		text-align: right;
	}
	.preview {
		border: 1px solid var(--map-border-soft);
		border-radius: 7px;
		background: var(--map-bg-surface);
		overflow: hidden;
	}
	.preview-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.preview-scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		min-width: 100%;
	}
	th,
	td {
		padding: 7px 10px;
		text-align: left;
		white-space: nowrap;
		font-family: var(--map-font-mono);
	}
	th {
		background: var(--map-bg-list-a);
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		color: var(--map-ink-muted);
		border-bottom: 1px solid var(--map-border-soft);
	}
	td {
		font-size: 11.5px;
		color: var(--map-ink-2);
		border-bottom: 1px solid var(--map-border-faint);
	}
	.cta {
		padding: 14px 20px 18px;
		border-top: 1px solid var(--map-border-strong);
		background: var(--map-bg-surface);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.primary {
		padding: 11px 16px;
		border-radius: 6px;
		font: 600 13px var(--map-font-body);
		border: 1px solid var(--map-ink);
		background: var(--map-ink);
		color: var(--map-on-dark);
		cursor: pointer;
	}
	.primary[aria-busy='true'] {
		background: var(--map-ink-2);
		cursor: progress;
	}
	.primary:disabled:not([aria-busy='true']) {
		border-color: var(--map-accent-tint-border);
		background: var(--map-bg-list-a);
		color: var(--map-ink-disabled);
		cursor: not-allowed;
	}
	.error {
		font-size: 12px;
		color: var(--map-error-text);
	}
	.disclaimer {
		margin: 0;
		padding: 8px 10px;
		border-radius: 6px;
		background: var(--map-bg-list-a);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.cta-note a {
		color: var(--map-accent);
	}
	.cta-note {
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--map-ink-muted);
	}
	.page :global(.page-links) {
		padding: 12px 18px;
		font-size: 11.5px;
		color: var(--map-ink-3);
		background: var(--map-bg-surface);
		border-top: 1px solid var(--map-border-strong);
	}
</style>
