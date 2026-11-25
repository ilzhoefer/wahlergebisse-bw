<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import SearchBox, { type SearchHit } from '#lib/components/map/SearchBox.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import PageMeta from '#lib/components/PageMeta.svelte';
	import { fmtNum, fmtPct } from '#lib/map/breakdown.ts';
	import { listOutcome } from '#lib/map/listJump.ts';
	import { writeShareParams } from '#lib/map/shareUrl.ts';
	import type { Candidacy, PersonHit } from '#lib/server/candidatePage.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { formatDate as fmtDate } from '#lib/formatDate.ts';

	let { data } = $props();
	const c = $derived(data.candidate);

	function outcome(x: Candidacy) {
		if (x.elected === null || x.listSeats === null || x.position === null || x.alphabetical)
			return null;
		return listOutcome(x.position, x.elected, x.listSeats);
	}

	/** The election on the map, focused on this candidacy's Gemeinde, Kreis or Wahlkreis. */
	function electionHref(x: Candidacy) {
		const wahlkreis = x.electionType === 2 || x.electionType === 3;
		return `${resolve('/')}?${writeShareParams({
			wahl: x.electionType,
			datum: x.date,
			...(wahlkreis ? { ebene: 'Wahlkreis', wk: String(x.placeRs) } : { gebiet: x.placeRs })
		})}`;
	}

	function placeHref(x: Candidacy) {
		if (x.electionType === 6) return resolve('/gemeinde/[rs]', { rs: String(x.placeRs) });
		return electionHref(x);
	}

	async function findPeople(q: string): Promise<SearchHit[]> {
		const res = await fetch(`${resolve('api/kandidaten')}?q=${encodeURIComponent(q)}`);
		if (!res.ok) return [];
		return ((await res.json()) as PersonHit[]).map((h) => ({
			id: h.name,
			primary: h.name,
			secondary: [h.party, h.latest, m.candidate_search_elections({ n: h.elections })]
				.filter(Boolean)
				.join(' · '),
			pick: () => goto(resolve('/kandidat/[name]', { name: h.name }))
		}));
	}

	const electedCount = $derived(c.candidacies.filter((x) => x.elected).length);
	const description = $derived(
		m.candidate_meta_description({
			name: c.name,
			n: c.candidacies.length,
			places: c.places.join(', ') || c.candidacies[0].placeName
		})
	);
</script>

<PageMeta title="{c.name} – {m.candidate_meta_title()}" {description} />

<div class="map-root page">
	<SiteHeader kicker={m.candidate_kicker()} />

	<main class="layout">
		<section class="card head">
			<span class="map-lbl">{m.candidate_kicker()}</span>
			<h1>{c.name}</h1>
			<p class="sub">
				{m.candidate_summary({ n: c.candidacies.length, elected: electedCount })}
			</p>
			{#if c.places.length > 1}
				<p class="note">{m.candidate_namesakes({ places: c.places.join(', ') })}</p>
			{/if}
			<div class="find">
				<SearchBox
					{findPeople}
					placeholder={m.candidate_search_placeholder()}
					peopleLabel={m.candidate_search_group()}
				/>
			</div>
		</section>

		<section class="card">
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">{m.candidate_col_election()}</th>
							<th scope="col">{m.candidate_col_place()}</th>
							<th scope="col">{m.candidate_col_list()}</th>
							<th scope="col" class="num">{m.candidate_col_position()}</th>
							<th scope="col" class="num">{m.candidate_col_votes()}</th>
							<th scope="col" class="num">{m.candidate_col_rank()}</th>
							<th scope="col">{m.candidate_col_result()}</th>
						</tr>
					</thead>
					<tbody>
						{#each c.candidacies as x (`${x.date}|${x.electionType}|${x.placeRs}|${x.listName}`)}
							{@const o = outcome(x)}
							<tr>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- electionHref builds on resolve() -->
								<td><a href={electionHref(x)}>{x.electionDescription} {fmtDate(x.date)}</a></td>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- placeHref builds on resolve() -->
								<td><a href={placeHref(x)}>{x.placeName}</a></td>
								<td>{x.listName ?? '–'}</td>
								<td
									class="num"
									title={x.alphabetical ? m.candidate_alphabetical_hint() : undefined}
								>
									{#if x.alphabetical}<span class="of">
											{m.candidate_alphabetical()}
										</span>{/if}{x.position ?? '–'}{#if x.listSize}<span class="of">
											/ {x.listSize}
										</span>{/if}
								</td>
								<td class="num">
									{fmtNum(x.votes)}{#if x.sharePct !== null}<span class="of">
											({fmtPct(x.sharePct)})
										</span>{/if}
								</td>
								<td class="num">{x.voteRank ?? '–'}</td>
								<td>
									{#if x.mandate === 'direct'}
										<span class="badge elected">{m.candidate_result_direct()}</span>
									{:else if x.mandate === 'list'}
										<span class="badge elected">
											{x.listPlace
												? m.candidate_result_list_place({ place: x.listPlace })
												: m.candidate_result_list()}
										</span>
									{:else if x.mandate === 'directNoSeat'}
										<span class="badge out" title={m.candidate_result_direct_no_seat_hint()}>
											{m.candidate_result_direct_no_seat()}
										</span>
									{:else if x.elected === null}
										<span class="muted">{m.candidate_result_unknown()}</span>
									{:else if x.elected}
										<span class="badge elected">{m.candidate_result_elected()}</span>
									{:else}
										<span class="muted">{m.candidate_result_not_elected()}</span>
									{/if}
									{#if o === 'jumped'}
										<span
											class="badge jump"
											title={m.candidate_jumped_hint({ seats: x.listSeats ?? 0 })}
										>
											{m.candidate_jumped({ from: x.position ?? 0, to: x.voteRank ?? 0 })}
										</span>
									{:else if o === 'pushedOut'}
										<span
											class="badge out"
											title={m.candidate_pushed_out_hint({ seats: x.listSeats ?? 0 })}
										>
											{m.candidate_pushed_out()}
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="note">{m.candidate_table_note()}</p>
		</section>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
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
	/* SearchBox brings the map panel's padding and divider; here it sits inside the card. */
	.find {
		margin: 14px -20px -20px;
	}
	.find :global(.search) {
		border-bottom: none;
	}
	@media (max-width: 759px) {
		.find {
			margin: 12px -16px -16px;
		}
		.find :global(.search) {
			padding: 10px 16px;
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
	.sub {
		margin: 0;
		font-size: 13px;
		color: var(--map-ink-3);
	}
	.note {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.table-wrap {
		overflow-x: auto;
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
		padding: 7px 10px 7px 0;
		border-top: 1px solid var(--map-border-faint);
		vertical-align: baseline;
	}
	td a {
		color: var(--map-ink);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.of,
	.muted {
		color: var(--map-ink-muted);
	}
	.badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		padding: 1px 7px;
		border-radius: 10px;
		margin-right: 4px;
		white-space: nowrap;
	}
	.elected {
		background: var(--map-success-bg);
		color: var(--map-success-text);
		border: 1px solid var(--map-success-border);
	}
	.jump {
		background: var(--map-bg-selected-tint);
		color: var(--map-accent);
		border: 1px solid var(--map-accent-tint-border);
	}
	.out {
		background: var(--map-warning-bg);
		color: var(--map-warning-text);
		border: 1px solid var(--map-warning-border);
	}
</style>
