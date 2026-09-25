<script lang="ts">
	let {
		kicker,
		label,
		current,
		total
	}: { kicker: string; label: string; current: number; total: number } = $props();

	const percent = $derived(total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
</script>

<div class="progress">
	<div class="top">
		<span class="map-lbl kicker">{kicker}</span>
		<span class="label">{label}</span>
		<span class="count">{current}/{total}</span>
	</div>
	<span class="track"><span class="fill" style="width: {percent}%"></span></span>
</div>

<style>
	.progress {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: 7px;
		min-width: 0;
	}
	.kicker {
		color: var(--map-ink-muted);
		flex: none;
	}
	.label {
		flex: 1;
		min-width: 0;
		font-size: 11.5px;
		color: var(--map-ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.count {
		flex: none;
		font: 500 11px var(--map-font-mono);
		color: var(--map-ink);
	}
	.track {
		display: block;
		height: 7px;
		border-radius: 4px;
		background: var(--map-bg-surface-sunken);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--map-accent);
		transition: width 0.3s linear;
	}
</style>
