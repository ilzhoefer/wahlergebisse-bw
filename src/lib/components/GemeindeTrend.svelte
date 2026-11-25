<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import TrendChart from '#lib/components/TrendChart.svelte';
	import { lineColor } from '#lib/map/colors.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import type { OverallTrend } from '#lib/server/gemeinde.ts';
	import * as m from '#lib/paraglide/messages.js';

	/** Party-family shares across every election of one Gemeinde, with elections and parties
	 * switchable. Mount it inside `{#key rs}` — the defaults are taken once from the first `trend`. */
	let {
		trend,
		name,
		typeOrder
	}: {
		trend: OverallTrend;
		name: string;
		/** Election types in the order the page lists them. */
		typeOrder: number[];
	} = $props();

	/** Bürgermeisterwahl, Bürgerentscheid, Andere: decided by candidates or a question, not parties. */
	const OFF_BY_DEFAULT = [7, 9, 10];
	const DEFAULT_PARTIES = 8;
	const ABBR: Record<number, () => string> = {
		1: m.election_abbr_1,
		2: m.election_abbr_2,
		3: m.election_abbr_3,
		4: m.election_abbr_4,
		5: m.election_abbr_5,
		6: m.election_abbr_6,
		7: m.election_abbr_7,
		8: m.election_abbr_8,
		9: m.election_abbr_9,
		10: m.election_abbr_10
	};

	type Election = OverallTrend['elections'][number];
	const key = (e: Election) => `${e.electionType}|${e.date}`;

	// svelte-ignore state_referenced_locally
	const hiddenElections = new SvelteSet(
		trend.elections.filter((e) => OFF_BY_DEFAULT.includes(e.electionType)).map(key)
	);
	// svelte-ignore state_referenced_locally
	const hiddenParties = new SvelteSet(
		trend.series.slice(DEFAULT_PARTIES).map((s) => s.partyFamilyId)
	);

	/** Per election type (in `typeOrder`), its elections. */
	const types = $derived(
		typeOrder
			.map((t) => trend.elections.filter((e) => e.electionType === t))
			.filter((list) => list.length > 0)
	);

	const shown = $derived(
		trend.elections.flatMap((e, i) => (hiddenElections.has(key(e)) ? [] : [i]))
	);
	const dates = $derived(shown.map((i) => trend.elections[i].date));
	const points = $derived(
		shown.map((i) => {
			const e = trend.elections[i];
			return { tick: ABBR[e.electionType]?.() ?? '', title: e.description };
		})
	);
	const series = $derived(
		trend.series
			.filter((s) => !hiddenParties.has(s.partyFamilyId))
			.map((s) => ({ ...s, key: s.partyFamilyId, values: shown.map((i) => s.values[i]) }))
			.filter((s) => s.values.some((v) => v != null))
	);

	function toggle<T>(set: SvelteSet<T>, value: T) {
		if (!set.delete(value)) set.add(value);
	}
	function toggleType(elections: Election[]) {
		const allShown = elections.every((e) => !hiddenElections.has(key(e)));
		for (const e of elections)
			if (allShown) hiddenElections.add(key(e));
			else hiddenElections.delete(key(e));
	}
</script>

<fieldset>
	<legend>{m.gemeinde_overall_elections()}</legend>
	{#each types as elections (elections[0].electionType)}
		<div class="row">
			<button
				type="button"
				class="type"
				title={m.gemeinde_overall_toggle_type({ election: elections[0].description })}
				onclick={() => toggleType(elections)}
			>
				{elections[0].description}
			</button>
			{#each elections as e (key(e))}
				<label class="chip" title={formatDate(e.date)}>
					<input
						type="checkbox"
						checked={!hiddenElections.has(key(e))}
						onchange={() => toggle(hiddenElections, key(e))}
					/>{e.date.slice(0, 4)}
				</label>
			{/each}
		</div>
	{/each}
</fieldset>

<fieldset>
	<legend>{m.gemeinde_overall_parties()}</legend>
	<div class="row">
		{#each trend.series as s (s.partyFamilyId)}
			<label class="chip">
				<input
					type="checkbox"
					checked={!hiddenParties.has(s.partyFamilyId)}
					onchange={() => toggle(hiddenParties, s.partyFamilyId)}
				/><span class="key" style="background: {lineColor(s.color ?? '#8a8171')}"></span>{s.name}
			</label>
		{/each}
	</div>
</fieldset>

{#if dates.length > 1 && series.length > 0}
	<TrendChart {dates} {points} {series} label={m.gemeinde_overall_label({ name })} />
{:else}
	<p class="empty">{m.gemeinde_overall_empty()}</p>
{/if}

<style>
	fieldset {
		margin: 0 0 12px;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		margin-bottom: 6px;
		padding: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		margin-bottom: 5px;
	}
	.type {
		min-width: 150px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: 12px;
		text-align: left;
		color: var(--map-ink-2);
		cursor: pointer;
	}
	.type:hover {
		color: var(--map-ink);
		text-decoration: underline;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px 3px 5px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		font-size: 12px;
		color: var(--map-ink-2);
		cursor: pointer;
	}
	.chip:has(input:checked) {
		color: var(--map-ink);
		border-color: var(--map-ink-muted);
	}
	.chip input {
		margin: 0;
		accent-color: var(--map-accent);
	}
	.key {
		display: inline-block;
		width: 12px;
		height: 3px;
		border-radius: 2px;
	}
	.empty {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--map-ink-muted);
	}
</style>
