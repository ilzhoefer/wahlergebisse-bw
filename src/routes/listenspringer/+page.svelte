<script lang="ts">
	import { resolve } from '$app/paths';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import PageMeta from '#lib/components/PageMeta.svelte';
	import { fmtNum } from '#lib/map/breakdown.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { formatDate as fmtDate } from '#lib/formatDate.ts';

	let { data } = $props();
	const s = $derived(data.stats);

	const pct = (a: number, b: number) =>
		b > 0 ? `${((a / b) * 100).toFixed(1).replace('.', ',')} %` : '–';
</script>

<PageMeta
	title={m.listjump_meta_title({ date: fmtDate(s.date) })}
	description={m.listjump_meta_description({
		share: pct(s.jumpedSeats, s.seats),
		date: fmtDate(s.date)
	})}
/>

<div class="map-root page">
	<SiteHeader kicker={m.listjump_title()}>
		{#if s.dates.length > 1}
			<form method="GET" class="picker">
				<select
					class="select"
					name="datum"
					aria-label={m.quality_election_label()}
					onchange={(ev) => ev.currentTarget.form?.requestSubmit()}
				>
					{#each s.dates as d (d)}
						<option value={d} selected={d === s.date}>{fmtDate(d)}</option>
					{/each}
				</select>
				<noscript><button type="submit">{m.quality_show()}</button></noscript>
			</form>
		{/if}
	</SiteHeader>

	<main class="layout">
		<section class="card">
			<span class="map-lbl">{m.listjump_kicker({ date: fmtDate(s.date) })}</span>
			<h1>{m.listjump_title()}</h1>
			<p class="intro">{m.listjump_intro()}</p>
			<div class="tiles">
				<div class="tile">
					<span class="tile-label">{m.listjump_tile_share()}</span>
					<span class="tile-value">{pct(s.jumpedSeats, s.seats)}</span>
					<span class="tile-sub">
						{m.listjump_tile_share_sub({
							jumped: fmtNum(s.jumpedSeats),
							seats: fmtNum(s.seats)
						})}
					</span>
				</div>
				<div class="tile">
					<span class="tile-label">{m.listjump_tile_gemeinden()}</span>
					<span class="tile-value">{fmtNum(s.gemeinden)}</span>
					<span class="tile-sub">
						{m.listjump_tile_gemeinden_sub({ excluded: fmtNum(s.excludedTeilort) })}
					</span>
				</div>
				<div class="tile">
					<span class="tile-label">{m.listjump_tile_alphabetical()}</span>
					<span class="tile-value">{pct(s.alphabeticalLists, s.lists)}</span>
					<span class="tile-sub">
						{m.listjump_tile_alphabetical_sub({
							n: fmtNum(s.alphabeticalLists),
							lists: fmtNum(s.lists)
						})}
					</span>
				</div>
			</div>
		</section>

		<section class="card">
			<h2>{m.listjump_top_jumps()}</h2>
			<p class="hint">{m.listjump_top_jumps_hint()}</p>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">{m.listjump_col_name()}</th>
							<th scope="col">{m.candidate_col_place()}</th>
							<th scope="col">{m.candidate_col_list()}</th>
							<th scope="col" class="num">{m.candidate_col_position()}</th>
							<th scope="col" class="num">{m.candidate_col_rank()}</th>
							<th scope="col" class="num">{m.candidate_col_votes()}</th>
						</tr>
					</thead>
					<tbody>
						{#each s.topJumps as j (`${j.rs}|${j.listName}|${j.name}`)}
							<tr>
								<td><a href={resolve('/kandidat/[name]', { name: j.name })}>{j.name}</a></td>
								<td><a href={resolve('/gemeinde/[rs]', { rs: String(j.rs) })}>{j.city}</a></td>
								<td>{j.listName}</td>
								<td class="num">{j.position}</td>
								<td class="num">{j.voteRank}</td>
								<td class="num">{fmtNum(j.votes)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card">
			<h2>{m.listjump_top_gemeinden()}</h2>
			<p class="hint">{m.listjump_top_gemeinden_hint()}</p>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">{m.gemeinde_kicker()}</th>
							<th scope="col" class="num">{m.map_stat_sitze()}</th>
							<th scope="col" class="num">{m.listjump_jumped()}</th>
							<th scope="col" class="num">%</th>
						</tr>
					</thead>
					<tbody>
						{#each s.topGemeinden as g (g.rs)}
							<tr>
								<td><a href={resolve('/gemeinde/[rs]', { rs: String(g.rs) })}>{g.city}</a></td>
								<td class="num">{g.seats}</td>
								<td class="num">{g.jumped}</td>
								<td class="num">{pct(g.jumped, g.seats)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card method">
			<h2>{m.listjump_method_heading()}</h2>
			<p>{m.listjump_method_1()}</p>
			<p>{m.listjump_method_2()}</p>
			<p>{m.listjump_method_3()}</p>
		</section>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		color: var(--map-ink);
	}
	.picker .select {
		font: 500 13px var(--map-font-body);
		padding: 5px 8px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: var(--map-bg-surface);
		color: var(--map-ink);
	}
	.layout {
		max-width: 920px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card {
		margin: 0;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		box-shadow: var(--map-shadow-card);
		padding: 20px 24px;
	}
	@media (max-width: 759px) {
		.card {
			padding: 16px;
		}
	}
	.map-lbl {
		color: var(--map-ink-muted);
	}
	h1 {
		margin: 4px 0 8px;
		font-family: var(--map-font-heading);
		font-size: 34px;
		font-weight: 500;
		line-height: 1.1;
	}
	h2 {
		margin: 0;
		font-family: var(--map-font-heading);
		font-size: 22px;
		font-weight: 500;
	}
	.intro,
	.hint,
	.method p {
		margin: 6px 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--map-ink-3);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
		margin-top: 16px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		border-radius: 8px;
		background: var(--map-bg-surface-sunken);
	}
	.tile-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--map-ink-2);
	}
	.tile-value {
		font-size: 28px;
		font-weight: 600;
		color: var(--map-ink);
	}
	.tile-sub {
		font-size: 11.5px;
		color: var(--map-ink-muted);
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: 10px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	th {
		text-align: left;
		font: 600 10.5px var(--map-font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--map-ink-muted);
		padding: 0 10px 8px 0;
		white-space: nowrap;
	}
	td {
		padding: 6px 10px 6px 0;
		border-top: 1px solid var(--map-border-faint);
	}
	td a {
		color: var(--map-ink);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
