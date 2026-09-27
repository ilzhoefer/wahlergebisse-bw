<script lang="ts">
	interface Crumb {
		name: string;
		current: boolean;
	}

	interface Props {
		crumbs: Crumb[];
		onCrumbClick: (index: number) => void;
		showUp: boolean;
		upLabel: string;
		onUp: () => void;
	}

	let { crumbs, onCrumbClick, showUp, upLabel, onUp }: Props = $props();
</script>

<div class="wrap">
	<div class="pill">
		{#each crumbs as c, i (i)}
			{#if i > 0}<span class="sep">/</span>{/if}
			<button
				type="button"
				class="crumb"
				class:current={c.current}
				disabled={c.current}
				onclick={() => onCrumbClick(i)}
			>
				{c.name}
			</button>
		{/each}
	</div>
	{#if showUp}
		<button type="button" class="up-pill" onclick={onUp}>{upLabel}</button>
	{/if}
</div>

<style>
	.wrap {
		position: absolute;
		top: 14px;
		left: 16px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		z-index: 4;
	}
	.pill {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(255, 253, 248, 0.94);
		border: 1px solid var(--map-border-strong);
		border-radius: 20px;
		padding: 5px 12px;
		box-shadow: var(--map-shadow-pill);
	}
	.crumb {
		font: inherit;
		font-family: var(--map-font-body);
		font-size: 12px;
		font-weight: 600;
		color: var(--map-accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.crumb.current {
		font-weight: 500;
		color: var(--map-ink-2);
		cursor: default;
	}
	.sep {
		font-size: 12px;
		color: #c4bba7;
	}
	.up-pill {
		font-family: var(--map-font-body);
		background: rgba(255, 253, 248, 0.94);
		border: 1px solid var(--map-border-strong);
		border-radius: 20px;
		padding: 5px 11px;
		font-size: 12px;
		font-weight: 500;
		color: var(--map-accent);
		cursor: pointer;
		box-shadow: var(--map-shadow-pill);
	}
</style>
