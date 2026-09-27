<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { seatLayout, spectrumRank } from '$lib/map/seatLayout';

	export interface SeatParty {
		name: string | null;
		color: string | null;
		seats: number;
	}

	let { parties }: { parties: SeatParty[] } = $props();

	// Stable sort: parties at the same spectrum position keep their vote-share order.
	const seated = $derived(
		parties.filter((p) => p.seats > 0).sort((a, b) => spectrumRank(a.name) - spectrumRank(b.name))
	);
	const layout = $derived(seatLayout(seated.reduce((sum, p) => sum + p.seats, 0)));
	const groups = $derived.by(() => {
		let offset = 0;
		return seated.map((p) => {
			const dots = layout.dots.slice(offset, offset + p.seats);
			offset += p.seats;
			return { ...p, dots };
		});
	});
	const summary = $derived(
		m.map_seat_chart_label({ parties: seated.map((p) => `${p.name ?? '?'} ${p.seats}`).join(', ') })
	);
</script>

{#if seated.length > 0}
	{@const e = 1 + layout.dotRadius + 0.02}
	<svg class="seat-chart" viewBox="{-e} {-e} {2 * e} {2 * e - 1}" role="img" aria-label={summary}>
		<title>{summary}</title>
		{#each groups as g (g.name)}
			<g fill={g.color ?? '#cfc8ba'}>
				<title>{g.name}: {g.seats}</title>
				{#each g.dots as d, i (i)}
					<circle cx={d.x} cy={d.y} r={layout.dotRadius} />
				{/each}
			</g>
		{/each}
	</svg>
{/if}

<style>
	.seat-chart {
		display: block;
		flex: none; /* sits in ResultPanel's flex column, which would otherwise squash its height */
		width: 100%;
		max-width: 260px;
		margin: 0 auto;
	}
	circle {
		stroke: var(--map-swatch-border);
		stroke-width: 0.005;
	}
</style>
