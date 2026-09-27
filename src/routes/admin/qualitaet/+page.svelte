<script lang="ts">
	import { resolve } from '$app/paths';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import type { CityIssue } from '$lib/server/quality';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const key = (e: { electionType: number; date: string }) => `${e.electionType}|${e.date}`;
	const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE');
	const fmtPct = (v: number) => v.toFixed(1).replace('.', ',');

	const sections = $derived(
		data.report
			? [
					{
						title: m.quality_missing_results(),
						hint: m.quality_missing_results_hint(),
						items: data.report.missingResults,
						detail: () => ''
					},
					{
						title: m.quality_missing_aggregates(),
						hint: m.quality_missing_aggregates_hint(),
						items: data.report.missingAggregates,
						detail: () => ''
					},
					{
						title: m.quality_sum_mismatches(),
						hint: m.quality_sum_mismatches_hint(),
						items: data.report.sumMismatches,
						detail: (i: CityIssue) =>
							m.quality_sum_detail({
								stations: String(i.stations ?? 0),
								pct: fmtPct(i.worstPct ?? 0)
							})
					},
					{
						title: m.quality_unmapped(),
						hint: m.quality_unmapped_hint(),
						items: data.report.unmappedParties,
						detail: (i: CityIssue) => i.lists ?? ''
					},
					{
						title: m.quality_turnout(),
						hint: m.quality_turnout_hint(),
						items: data.report.turnoutIssues,
						detail: (i: CityIssue) => m.quality_stations({ stations: String(i.stations ?? 0) })
					}
				]
			: []
	);

	function mapHref(rs: number) {
		if (!data.selected) return resolve('/');
		const q = new URLSearchParams({
			wahl: String(data.selected.electionType),
			datum: data.selected.date,
			gebiet: String(rs)
		});
		return `${resolve('/')}?${q}`;
	}
</script>

<svelte:head>
	<title>{m.quality_title()} · {m.admin_title()}</title>
</svelte:head>

<div class="map-root page">
	<SiteHeader kicker={m.quality_title()}>
		<a class="admin-link" href={resolve('/admin')}>{m.admin_title()}</a>
	</SiteHeader>

	<main class="layout">
		<form class="picker" method="GET">
			<label>
				<span class="map-lbl">{m.quality_election_label()}</span>
				<select class="select" name="e" onchange={(ev) => ev.currentTarget.form?.requestSubmit()}>
					{#each data.elections as e (key(e))}
						<option
							value={key(e)}
							selected={data.selected !== null && key(e) === key(data.selected)}
							>{e.label} {fmtDate(e.date)}</option
						>
					{/each}
				</select>
			</label>
			<noscript><button type="submit">{m.quality_show()}</button></noscript>
		</form>

		{#if !data.report || !data.selected}
			<p class="card">{m.quality_no_elections()}</p>
		{:else}
			<section class="card summary">
				<h1>{data.selected.label} {fmtDate(data.selected.date)}</h1>
				<p>
					{m.quality_coverage({
						withResults: String(data.report.withResults),
						gemeinden: String(data.report.gemeinden)
					})}
				</p>
				<p class="intro">{m.quality_intro()}</p>
			</section>

			{#each sections as s (s.title)}
				<section class="card">
					<h2>
						{s.title}
						<span class="count" class:ok={s.items.length === 0}>{s.items.length}</span>
					</h2>
					<p class="hint">{s.hint}</p>
					{#if s.items.length === 0}
						<p class="ok-text">{m.quality_ok()}</p>
					{:else}
						<ul>
							{#each s.items as item (item.rs)}
								<li>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mapHref is resolve('/') plus the share query -->
									<a href={mapHref(item.rs)}>{item.name}</a>
									{#if s.detail(item)}<span class="detail">{s.detail(item)}</span>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		color: var(--map-ink);
	}
	.admin-link {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-accent);
		text-decoration: none;
	}
	.layout {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.picker label {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--map-ink-muted);
	}
	.select {
		font: 500 13px var(--map-font-body);
		padding: 6px 8px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: var(--map-bg-surface);
		color: var(--map-ink);
		max-width: 100%;
	}
	.card {
		margin: 0;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		box-shadow: var(--map-shadow-card);
		padding: 18px 22px;
	}
	h1 {
		margin: 0 0 6px;
		font-family: var(--map-font-heading);
		font-size: 26px;
		font-weight: 500;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.count {
		font: 600 11.5px var(--map-font-mono);
		padding: 1px 7px;
		border-radius: 10px;
		background: var(--map-accent);
		color: #fff;
	}
	.count.ok {
		background: var(--map-success-fill);
		color: var(--map-ink);
	}
	.intro,
	.hint {
		margin: 6px 0 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.ok-text {
		margin: 10px 0 0;
		font-size: 13px;
		color: var(--map-ink-muted);
	}
	ul {
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 360px;
		overflow-y: auto;
	}
	li {
		display: flex;
		gap: 10px;
		align-items: baseline;
		font-size: 13px;
	}
	li a {
		color: var(--map-ink);
	}
	.detail {
		font: 500 11.5px var(--map-font-mono);
		color: var(--map-ink-3);
	}
</style>
