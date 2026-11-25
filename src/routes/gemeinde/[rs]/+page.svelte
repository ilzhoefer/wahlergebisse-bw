<script lang="ts">
	import { resolve } from '$app/paths';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import PageMeta from '$lib/components/PageMeta.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import SeatChart from '$lib/components/map/SeatChart.svelte';
	import { fmtNum, fmtPct } from '$lib/map/breakdown';
	import { KREISFREIE_STADT_RS } from '$lib/map/rs';
	import { writeShareParams } from '$lib/map/shareUrl';
	import type { ElectionHistory } from '$lib/server/gemeinde';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const g = $derived(data.gemeinde);

	const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE');
	const kreisLabel = $derived(KREISFREIE_STADT_RS.has(g.rs) ? m.gemeinde_stadtkreis() : g.kreis);

	function mapHref(e: ElectionHistory) {
		return `${resolve('/')}?${writeShareParams({
			wahl: e.electionType,
			datum: e.latest.date,
			stimme: e.latest.voteType === '1' ? '1' : undefined,
			gebiet: g.rs
		})}`;
	}

	const TOP_ROWS = 10;
	/** The latest result's top rows, scaled to the largest share like the map panel's bars; the rest
	 * (a Europawahl has 30+ lists) is summed into one line. Rows with seats are always shown. */
	function bars(e: ElectionHistory) {
		const rows = e.latest.breakdown?.rows.filter((r) => r.votePercent != null) ?? [];
		const max = Math.max(0.0001, ...rows.map((r) => r.votePercent!));
		const shown = rows.filter((r, i) => i < TOP_ROWS || r.seats);
		const rest = rows.filter((r) => !shown.includes(r));
		return {
			rows: shown.map((r) => ({ ...r, width: (r.votePercent! / max) * 100 })),
			restCount: rest.length,
			restPct: rest.reduce((sum, r) => sum + r.votePercent!, 0)
		};
	}

	/** Council members grouped by the list they were elected on, biggest group first. */
	const councilGroups = $derived.by(() => {
		const byList: Record<string, string[]> = {};
		for (const p of g.council?.members ?? []) (byList[p.list ?? '–'] ??= []).push(p.name);
		return Object.entries(byList).sort((a, b) => b[1].length - a[1].length);
	});

	const description = $derived(
		m.gemeinde_meta_description({
			name: g.name,
			elections: g.elections.map((e) => e.description).join(', ')
		})
	);
</script>

<PageMeta title="{g.name} – {m.gemeinde_meta_title()}" {description} />

<div class="map-root page">
	<SiteHeader kicker={m.gemeinde_kicker()} />

	<main class="layout">
		<section class="card head">
			<span class="map-lbl">{m.gemeinde_kicker()} · {g.rs}</span>
			<h1>{g.name}</h1>
			<p class="sub">
				{[g.officialName !== g.name ? g.officialName : null, kreisLabel, g.regierungsbezirk]
					.filter(Boolean)
					.join(' · ')}
			</p>
			{#if g.population}
				<p class="sub">{m.gemeinde_population({ n: fmtNum(g.population) })}</p>
			{/if}
			{#if g.elections.length > 1}
				<nav class="jump" aria-label={m.gemeinde_jump()}>
					{#each g.elections as e (e.electionType)}
						<a href="#wahl-{e.electionType}">{e.description}</a>
					{/each}
				</nav>
			{/if}
		</section>

		{#if g.elections.length === 0}
			<p class="card">{m.gemeinde_no_data()}</p>
		{/if}

		{#each g.elections as e (e.electionType)}
			{@const b = bars(e)}
			<section class="card" id="wahl-{e.electionType}">
				<div class="section-head">
					<h2>{e.description}</h2>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mapHref is resolve('/') plus the share query -->
					<a class="map-link" href={mapHref(e)}>{m.gemeinde_on_map()}</a>
				</div>

				<h3>
					{m.gemeinde_latest({ date: fmtDate(e.latest.date) })}
					{#if e.latest.breakdown?.turnout != null}
						<span class="turnout">
							· {m.map_info_wahlbeteiligung()}
							{fmtPct(e.latest.breakdown.turnout)}
						</span>
					{/if}
				</h3>
				{#if e.latest.voteType === '1'}
					<p class="note">{m.gemeinde_list_vote_note()}</p>
				{/if}

				{#if e.latest.breakdown?.seatTotal}
					<div class="seats">
						<SeatChart
							parties={e.latest.breakdown.rows.map((r) => ({
								name: r.partyName,
								color: r.color,
								seats: r.seats ?? 0
							}))}
						/>
					</div>
				{/if}

				<ul class="bars">
					{#each b.rows as r (r.partyName)}
						<li>
							<span class="bar-name">{r.partyName}</span>
							<span class="bar-track">
								<span class="bar-fill" style="background: {r.color}; width: {r.width}%"></span>
							</span>
							<span class="bar-val">{fmtPct(r.votePercent)}</span>
							<span class="bar-seats">{r.seats ? m.gemeinde_seats({ n: r.seats }) : ''}</span>
						</li>
					{/each}
				</ul>
				{#if b.restCount > 0}
					<p class="rest">{m.gemeinde_rest({ n: b.restCount, pct: fmtPct(b.restPct) })}</p>
				{/if}

				{#if e.dates.length > 1 && e.series.length > 0}
					<h3>
						{m.gemeinde_trend({ from: e.dates[0].slice(0, 4), to: e.latest.date.slice(0, 4) })}
					</h3>
					<TrendChart
						dates={e.dates}
						series={e.series.map((s) => ({ ...s, key: s.partyFamilyId }))}
						label={m.gemeinde_trend_label({ election: e.description, name: g.name })}
					/>
					{#if e.turnout.some((t) => t != null)}
						<p class="turnout-row">
							{m.map_info_wahlbeteiligung()}:
							{e.dates.map((d, i) => `${d.slice(0, 4)} ${fmtPct(e.turnout[i])}`).join(' · ')}
						</p>
					{/if}
				{/if}

				{#if e.electionType === 6 && g.council}
					<h3>
						{m.gemeinde_council({ date: fmtDate(g.council.date), n: g.council.members.length })}
					</h3>
					<div class="council">
						{#each councilGroups as [list, people] (list)}
							<div class="council-group">
								<span class="council-list">{list} ({people.length})</span>
								<ul class="council-people">
									{#each people as name (name)}
										<li><a href={resolve('/kandidat/[name]', { name })}>{name}</a></li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}

				{#if e.electionType === 6 && data.listJumps}
					{@const lj = data.listJumps}
					<h3>{m.listjump_heading({ date: fmtDate(lj.date) })}</h3>
					<p class="note">
						{m.listjump_gemeinde_intro({ jumped: lj.jumped.length, seats: lj.seats })}
						<a href={resolve('/listenspringer')}>{m.listjump_statewide_link()}</a>
					</p>
					{#if lj.teilortswahl}
						<p class="note warn">{m.listjump_teilort_note()}</p>
					{/if}
					{#if lj.alphabeticalLists.length}
						<p class="note">
							{m.listjump_alphabetical_note({ lists: lj.alphabeticalLists.join(', ') })}
						</p>
					{/if}
					<div class="jumps">
						{#each [{ title: m.listjump_jumped(), rows: lj.jumped }, { title: m.listjump_pushed_out(), rows: lj.pushedOut }] as group (group.title)}
							{#if group.rows.length}
								<div>
									<span class="council-list">{group.title} ({group.rows.length})</span>
									<ul class="jump-list">
										{#each group.rows as j (j.name + j.listName)}
											<li>
												<a href={resolve('/kandidat/[name]', { name: j.name })}>{j.name}</a>
												<span class="jump-detail">
													{j.listName} · {m.listjump_place_rank({
														position: j.position,
														rank: j.voteRank
													})}
												</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		color: var(--map-ink);
	}
	.layout {
		max-width: 820px;
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
		scroll-margin-top: 76px;
	}
	@media (max-width: 759px) {
		.card {
			padding: 16px;
		}
	}
	.head .map-lbl {
		color: var(--map-ink-muted);
	}
	h1 {
		margin: 4px 0 6px;
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
	h3 {
		margin: 18px 0 8px;
		font-size: 13px;
		font-weight: 600;
	}
	.sub {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--map-ink-3);
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 14px;
	}
	.jump a,
	.map-link {
		font-size: 12px;
		font-weight: 500;
		padding: 4px 9px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		color: var(--map-ink-2);
		text-decoration: none;
	}
	.jump a:hover,
	.map-link:hover {
		color: var(--map-ink);
		border-color: var(--map-ink-muted);
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.turnout {
		font-weight: 500;
		color: var(--map-ink-3);
	}
	.note,
	.turnout-row {
		margin: -4px 0 8px;
		font-size: 12px;
		color: var(--map-ink-3);
	}
	.turnout-row {
		margin: 8px 0 0;
	}
	.seats {
		max-width: 260px;
		margin-bottom: 8px;
	}
	.bars {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: minmax(90px, 200px) 1fr auto auto;
		gap: 5px 10px;
		align-items: center;
		font-size: 12.5px;
	}
	.bars li {
		display: contents;
	}
	.bar-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar-track {
		height: 8px;
		background: var(--map-bg-surface-sunken);
		border-radius: 0 4px 4px 0;
	}
	.bar-fill {
		display: block;
		height: 100%;
		border-radius: 0 4px 4px 0;
	}
	.bar-val,
	.bar-seats {
		font: 500 11.5px var(--map-font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: var(--map-ink-2);
	}
	.bar-seats {
		color: var(--map-ink-muted);
	}
	.rest {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--map-ink-muted);
	}
	.note.warn {
		color: var(--map-warning-text);
	}
	.note a {
		color: var(--map-accent);
	}
	.jumps {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 12px 24px;
		font-size: 12.5px;
	}
	.jump-list {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.jump-list a {
		color: var(--map-ink);
	}
	.jump-detail {
		margin-left: 6px;
		font-size: 11.5px;
		color: var(--map-ink-muted);
	}
	.council {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12.5px;
		line-height: 1.5;
	}
	.council-list {
		display: block;
		font-weight: 600;
	}
	.council-people {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* Names read "Nachname, Vorname" — so a middle dot, not a comma, separates them. */
	.council-people li:not(:last-child)::after {
		content: '·';
		margin: 0 7px;
		color: var(--map-ink-muted);
	}
	.council-people a {
		color: var(--map-ink-2);
	}
</style>
