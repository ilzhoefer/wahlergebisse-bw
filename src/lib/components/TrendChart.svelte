<script lang="ts">
	import { lineColor } from '#lib/map/colors.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { formatDate } from '#lib/formatDate.ts';

	export interface Series {
		key: string | number;
		name: string;
		color: string | null;
		/** One value (share in %) per entry of `dates`; null where the series has no value. */
		values: (number | null)[];
	}

	/**
	 * Party shares over several elections: one 2px line per party on a real time axis, end labels
	 * where they don't collide, a legend, a crosshair tooltip snapping to the nearest election, and
	 * the same numbers as a table (party colours are conventional, not colour-blind safe — so identity
	 * never rests on colour alone).
	 */
	let {
		dates,
		series,
		label,
		points
	}: {
		dates: string[];
		series: Series[];
		label: string;
		/** Per date: a short tick label above the year and a tooltip title. Several points may share a
		 * date (elections on the same day), so with `points` they are spaced evenly, not by time. */
		points?: { tick: string; title: string }[];
	} = $props();

	let width = $state(600);
	const height = $derived(points ? 244 : 230);
	const pad = $derived({ top: 12, right: 96, bottom: points ? 40 : 26, left: 34 });
	const innerW = $derived(Math.max(120, width - pad.left - pad.right));
	const innerH = $derived(height - pad.top - pad.bottom);

	const times = $derived(dates.map((d) => new Date(d).getTime()));
	const tMin = $derived(Math.min(...times));
	const tMax = $derived(Math.max(...times));
	const x = (i: number) =>
		pad.left +
		(points
			? dates.length > 1
				? (i / (dates.length - 1)) * innerW
				: innerW / 2
			: tMax === tMin
				? innerW / 2
				: ((times[i] - tMin) / (tMax - tMin)) * innerW);
	/** Show every n-th x label so neighbours don't overlap. */
	const labelEvery = $derived(
		points && dates.length > 1 ? Math.ceil(36 / (innerW / (dates.length - 1))) : 1
	);

	const yMax = $derived(
		Math.max(
			10,
			Math.ceil(Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0))) / 10) * 10
		)
	);
	const y = (v: number) => pad.top + innerH - (v / yMax) * innerH;
	const yTicks = $derived(
		Array.from(
			{ length: Math.floor(yMax / (yMax > 40 ? 20 : 10)) + 1 },
			(_, i) => i * (yMax > 40 ? 20 : 10)
		)
	);

	const stroke = (c: string | null) => lineColor(c ?? '#8a8171');
	const fmt = (v: number | null) => (v == null ? '–' : `${v.toFixed(1).replace('.', ',')} %`);

	/** Path through the non-null points; a gap (party didn't run) breaks the line. */
	function path(values: (number | null)[]) {
		let d = '';
		let pen = false;
		values.forEach((v, i) => {
			if (v == null) return void (pen = false);
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
			pen = true;
		});
		return d;
	}

	/** End labels at each series' last value, skipping any that would overlap one already placed. */
	const endLabels = $derived.by(() => {
		const last = series
			.map((s) => {
				const i = s.values.findLastIndex((v) => v != null);
				return i < 0 ? null : { s, i, py: y(s.values[i]!) };
			})
			.filter((l) => l !== null)
			.sort((a, b) => a.py - b.py);
		const placed: typeof last = [];
		for (const l of last) if (placed.every((p) => Math.abs(p.py - l.py) >= 13)) placed.push(l);
		return placed;
	});

	let hover = $state<number | null>(null);
	function onMove(ev: PointerEvent) {
		const svg = ev.currentTarget as SVGSVGElement;
		const px = ev.clientX - svg.getBoundingClientRect().left;
		let best = 0;
		for (let i = 1; i < dates.length; i++)
			if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
		hover = best;
	}
	const hoverRows = $derived(
		hover === null
			? []
			: series
					.map((s) => ({ s, v: s.values[hover!] }))
					.filter((r) => r.v != null)
					.sort((a, b) => b.v! - a.v!)
	);
	const year = (d: string) => d.slice(0, 4);
</script>

<figure class="trend">
	<ul class="legend" aria-label={m.chart_legend()}>
		{#each series as s (s.key)}
			<li><span class="key" style="background: {stroke(s.color)}"></span>{s.name}</li>
		{/each}
	</ul>

	<div class="plot" bind:clientWidth={width}>
		<svg
			{width}
			{height}
			role="img"
			aria-label={label}
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
		>
			{#each yTicks as t (t)}
				<line class="grid" x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} />
				<text class="tick" x={pad.left - 6} y={y(t) + 4} text-anchor="end">{t}</text>
			{/each}
			{#each dates as d, i (i)}
				{#if i % labelEvery === 0}
					<text class="tick" x={x(i)} y={height - 8} text-anchor="middle">
						{#if points}<tspan x={x(i)} dy="-13" class="tick-type">{points[i].tick}</tspan><tspan
								x={x(i)}
								dy="13"
							>
								{year(d)}
							</tspan>{:else}{year(d)}{/if}
					</text>
				{/if}
			{/each}

			{#if hover !== null}
				<line class="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} />
			{/if}

			{#each series as s (s.key)}
				<path d={path(s.values)} fill="none" stroke={stroke(s.color)} class="line" />
				{#each s.values as v, i (i)}
					{#if v != null}
						<circle
							cx={x(i)}
							cy={y(v)}
							r="4"
							fill={stroke(s.color)}
							stroke="var(--map-bg-surface)"
							stroke-width="2"
						/>
					{/if}
				{/each}
			{/each}

			{#each endLabels as l (l.s.key)}
				<text class="end" x={x(l.i) + 9} y={l.py + 4}>{l.s.name} {fmt(l.s.values[l.i])}</text>
			{/each}
		</svg>

		{#if hover !== null && hoverRows.length}
			<div
				class="tooltip"
				style="left: {x(hover) > width / 2 ? Math.max(0, x(hover) - 190) : x(hover) + 12}px"
				aria-hidden="true"
			>
				<div class="tt-head">
					{points ? `${points[hover].title} · ` : ''}{formatDate(dates[hover])}
				</div>
				{#each hoverRows as r (r.s.key)}
					<div class="tt-row">
						<span class="key" style="background: {stroke(r.s.color)}"></span>
						<span class="tt-name">{r.s.name}</span>
						<span class="tt-val">{fmt(r.v)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<details class="table-view">
		<summary>{m.chart_show_table()}</summary>
		<table>
			<thead>
				<tr>
					<th scope="col"></th>
					{#each dates as d, i (i)}<th scope="col">
							{points ? `${points[i].tick} ` : ''}{year(d)}
						</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each series as s (s.key)}
					<tr>
						<th scope="row">{s.name}</th>
						{#each s.values as v, i (i)}<td>{fmt(v)}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>

<style>
	.trend {
		margin: 0;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 0 0 8px;
		padding: 0;
		list-style: none;
		font-size: 12px;
		color: var(--map-ink-2);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.key {
		display: inline-block;
		width: 14px;
		height: 3px;
		border-radius: 2px;
		flex: none;
	}
	.plot {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
		touch-action: pan-y;
	}
	.grid {
		stroke: var(--map-border-soft);
		stroke-width: 1;
	}
	.crosshair {
		stroke: var(--map-ink-muted);
		stroke-width: 1;
	}
	.tick {
		font: 500 10.5px var(--map-font-mono);
		fill: var(--map-ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.tick-type {
		font-weight: 600;
	}
	.line {
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.end {
		font: 600 11px var(--map-font-body);
		fill: var(--map-ink-2);
	}
	.tooltip {
		position: absolute;
		top: 4px;
		width: 178px;
		padding: 8px 10px;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		box-shadow: var(--map-shadow-card);
		pointer-events: none;
		font-size: 12px;
	}
	.tt-head {
		font: 600 11px var(--map-font-mono);
		color: var(--map-ink-muted);
		margin-bottom: 4px;
	}
	.tt-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tt-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--map-ink);
	}
	.tt-val {
		font: 500 11.5px var(--map-font-mono);
		color: var(--map-ink-2);
		font-variant-numeric: tabular-nums;
	}
	.table-view {
		margin-top: 6px;
		font-size: 12px;
	}
	.table-view summary {
		cursor: pointer;
		color: var(--map-accent);
	}
	table {
		margin-top: 6px;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 3px 10px 3px 0;
		text-align: right;
		font-weight: 500;
	}
	th[scope='row'] {
		text-align: left;
	}
</style>
