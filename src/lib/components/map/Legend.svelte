<script lang="ts">
	import { diffGradientCss } from '$lib/map/colors';

	interface PartyEntry {
		name: string;
		color: string;
	}

	interface Props {
		mode: 'party' | 'turnout' | 'hochburg' | 'diff';
		title: string;
		note: string;
		partyEntries?: PartyEntry[];
		turnoutMinLabel?: string;
		turnoutMaxLabel?: string;
		hochburgColor?: string;
		hochburgMinLabel?: string;
		hochburgMaxLabel?: string;
		diffMinLabel?: string;
		diffMaxLabel?: string;
		/** What the left (+) and right (−) ends of the diff bar mean, e.g. "Erst vorn" / "Zweit vorn". */
		diffPlusWord?: string;
		diffMinusWord?: string;
		/** Position (0–100) of the currently-hovered region's value on the gradient's min–max scale, or
		 * null when nothing is hovered / hovering doesn't apply to this mode — shows a marker on the bar
		 * so the legend answers "where does this region sit" for Wahlbeteiligung/Hochburg. */
		markerPercent?: number | null;
	}

	let {
		mode,
		title,
		note,
		partyEntries = [],
		turnoutMinLabel,
		turnoutMaxLabel,
		hochburgColor,
		hochburgMinLabel,
		hochburgMaxLabel,
		diffMinLabel,
		diffMaxLabel,
		diffPlusWord = '',
		diffMinusWord = '',
		markerPercent = null
	}: Props = $props();
</script>

<div class="legend">
	<div class="header">
		<span class="map-lbl" style="color: var(--map-ink)">{title}</span>
		<span class="map-lbl" style="color: var(--map-ink-muted)">{note}</span>
	</div>

	{#if mode === 'party'}
		<div class="party-list">
			{#each partyEntries as p (p.name)}
				<span class="party-row">
					<span class="swatch" style="background: {p.color}"></span>
					{p.name}
				</span>
			{/each}
		</div>
	{:else if mode === 'turnout'}
		<div>
			<div class="gradient-wrap">
				<div class="gradient" style="background: linear-gradient(to right, #f7fbff, #08306b)"></div>
				{#if markerPercent !== null}
					<div class="marker" style="left: {markerPercent}%"></div>
				{/if}
			</div>
			<div class="gradient-labels">
				<span>{turnoutMinLabel}</span><span>{turnoutMaxLabel}</span>
			</div>
		</div>
	{:else if mode === 'diff'}
		<div>
			<div class="gradient-wrap">
				<div class="gradient" style="background: {diffGradientCss}"></div>
				<!-- Bar runs max → min (Erst ahead on the left), so the marker is mirrored. -->
				{#if markerPercent !== null}
					<div class="marker" style="left: {100 - markerPercent}%"></div>
				{/if}
			</div>
			<div class="gradient-labels">
				<span>{diffMaxLabel}</span><span>0</span><span>{diffMinLabel}</span>
			</div>
			<div class="gradient-labels">
				<span>← {diffPlusWord}</span>
				<span>{diffMinusWord} →</span>
			</div>
		</div>
	{:else}
		<div>
			<div class="gradient-wrap">
				<div
					class="gradient"
					style="background: linear-gradient(to right, white, {hochburgColor})"
				></div>
				{#if markerPercent !== null}
					<div class="marker" style="left: {markerPercent}%"></div>
				{/if}
			</div>
			<div class="gradient-labels">
				<span>{hochburgMinLabel}</span><span>{hochburgMaxLabel}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.legend {
		position: absolute;
		bottom: 18px;
		right: 18px;
		background: rgba(255, 253, 248, 0.95);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		padding: 12px 14px;
		box-shadow: var(--map-shadow-overlay);
		width: 214px;
		z-index: 3;
		box-sizing: border-box;
	}
	.header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 9px;
	}
	.party-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 160px;
		overflow-y: auto;
	}
	.party-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--map-font-body);
		font-size: 12px;
		color: var(--map-ink-2);
	}
	.swatch {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		flex: none;
		border: 0.5px solid var(--map-swatch-border);
	}
	/* Match the map's fill-opacity (MapView.svelte) so legend colours look like the map. */
	.swatch,
	.gradient {
		opacity: 0.7;
	}
	.gradient-wrap {
		position: relative;
	}
	.gradient {
		height: 10px;
		border-radius: 3px;
		border: 0.5px solid rgba(33, 29, 24, 0.14);
	}
	.marker {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: var(--map-ink);
		border: 1px solid var(--map-bg-surface);
		border-radius: 1px;
		transform: translateX(-50%);
		pointer-events: none;
	}
	.gradient-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
		font: 400 10.5px var(--map-font-mono);
		color: var(--map-ink-muted);
	}
</style>
