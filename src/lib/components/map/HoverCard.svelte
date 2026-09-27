<script lang="ts">
	interface Row {
		key: string;
		color: string | null;
		name: string;
		pct: string;
		widthPercent: number;
	}

	interface Data {
		name: string;
		level: string;
		turnoutLabel: string;
		turnoutValue: string;
		rows: Row[];
		hint: string;
	}

	interface Props {
		/** Cursor position relative to the map container, or null when nothing is hovered. */
		point: { x: number; y: number } | null;
		containerWidth: number;
		containerHeight: number;
		data: Data | null;
	}

	let { point, containerWidth, containerHeight, data }: Props = $props();

	let el: HTMLDivElement | undefined = $state();
	let left = $state(16);
	let top = $state(56);

	// Ports the click-dummy's `tipPos`/`placeTip` verbatim (lines 251–270 of the .dc.html): position
	// is written directly rather than derived purely reactively, because the flip test needs the
	// card's *actual* rendered size (it varies with content — a party with a long name, or fewer than
	// 5 rows near the bottom of a drill) rather than a hardcoded fallback.
	function reposition() {
		if (!point || !el) return;
		const tw = el.offsetWidth || 244;
		const th = el.offsetHeight || 238;
		const off = 18;
		let l = point.x + off;
		let t = point.y + off;
		if (l + tw > containerWidth - 12) l = point.x - tw - off;
		if (t + th > containerHeight - 12) t = point.y - th - off;
		left = Math.max(12, l);
		top = Math.max(56, t);
	}

	$effect(() => {
		void point;
		void data;
		void containerWidth;
		void containerHeight;
		reposition();
	});
</script>

{#if data && point}
	<div class="hover-card" bind:this={el} style="left:{left}px; top:{top}px">
		<div class="head">
			<span class="name">{data.name}</span>
			<span class="map-lbl" style="color: var(--map-ink-muted)">{data.level}</span>
		</div>
		<div class="turnout">
			<span class="map-lbl" style="color: var(--map-ink-muted)">{data.turnoutLabel}</span>
			<span class="turnout-value">{data.turnoutValue}</span>
		</div>
		{#if data.rows.length > 0}
			<div class="divider"></div>
			<div class="rows">
				{#each data.rows as r (r.key)}
					<div class="row">
						<div class="row-top">
							<span class="swatch" style="background: {r.color}"></span>
							<span class="party">{r.name}</span>
							<span class="pct">{r.pct}</span>
						</div>
						<div class="bar-track">
							<div class="bar-fill" style="background: {r.color}; width: {r.widthPercent}%"></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
		{#if data.hint}
			<div class="hint">{data.hint}</div>
		{/if}
	</div>
{/if}

<style>
	.hover-card {
		position: absolute;
		width: 244px;
		box-sizing: border-box;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 9px;
		padding: 12px 14px;
		box-shadow: var(--map-shadow-hover-card);
		pointer-events: none;
		z-index: 5;
		font-family: var(--map-font-body);
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.name {
		font-size: 13px;
		font-weight: 600;
		color: var(--map-ink);
	}
	.turnout {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-top: 3px;
	}
	.turnout-value {
		white-space: nowrap;
		font: 500 11px var(--map-font-mono);
		color: var(--map-ink-2);
	}
	.divider {
		height: 1px;
		background: var(--map-border-soft);
		margin: 9px 0;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.row-top {
		display: flex;
		align-items: baseline;
		gap: 7px;
	}
	.swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex: none;
		border: 0.5px solid var(--map-swatch-border);
	}
	.party {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--map-ink);
		flex: 1;
		min-width: 0;
	}
	.pct {
		font: 500 11px var(--map-font-mono);
		color: var(--map-ink-2);
	}
	.bar-track {
		height: 5px;
		border-radius: 2px;
		background: var(--map-bg-surface-sunken);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
	}
	.hint {
		margin-top: 9px;
		font-size: 11px;
		color: var(--map-ink-muted);
	}
</style>
