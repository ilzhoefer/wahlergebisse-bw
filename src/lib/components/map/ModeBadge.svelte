<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { SelectOption } from './Toolbar.svelte';

	interface Props {
		text: string;
		/** Hochburg, Stimmensplitting, Veränderung: the party (or Veränderung metric) select. */
		partyOptions?: SelectOption[] | null;
		selectedParty?: string;
		partyColor?: string;
		onPartyChange?: (value: string) => void;
		/** Veränderung: comparison dates ("ggü."). */
		compareOptions?: SelectOption[] | null;
		selectedCompare?: string;
		onCompareChange?: (value: string) => void;
	}
	let {
		text,
		partyOptions = null,
		selectedParty = '',
		partyColor = '#9c4a2f',
		onPartyChange,
		compareOptions = null,
		selectedCompare = '',
		onCompareChange
	}: Props = $props();
</script>

<div class="mode-badge">
	<span class="dot"></span>
	<span class="text">{text}</span>
	{#if partyOptions}
		<select
			class="badge-select party"
			style="box-shadow: inset 3px 0 0 {partyColor}"
			aria-label={m.map_badge_party_aria()}
			value={selectedParty}
			onchange={(e) => onPartyChange?.(e.currentTarget.value)}
		>
			{#each partyOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	{/if}
	{#if compareOptions}
		<span class="compare-label">{m.map_compare_label()}</span>
		<select
			class="badge-select compare"
			aria-label={m.map_badge_compare_aria()}
			value={selectedCompare}
			onchange={(e) => onCompareChange?.(e.currentTarget.value)}
		>
			{#each compareOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	{/if}
</div>

<style>
	.mode-badge {
		position: absolute;
		top: 14px;
		right: 16px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
		max-width: calc(100% - 32px);
		box-sizing: border-box;
		background: var(--map-ink);
		border-radius: 20px;
		padding: 4px 5px 4px 12px;
		min-height: 28px;
		z-index: 4;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--map-progress-running);
	}
	.text {
		font: 500 11px var(--map-font-mono);
		color: var(--map-on-dark);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
		padding-right: 7px;
	}
	.badge-select {
		padding: 4px 8px;
		border: none;
		border-radius: 14px;
		background: var(--map-bg-surface);
		color: var(--map-ink);
		cursor: pointer;
	}
	.party {
		/* a native select is as wide as its longest option — some party names are long */
		max-width: 150px;
		font: 600 11.5px var(--map-font-body);
	}
	.compare {
		font: 500 11.5px var(--map-font-mono);
	}
	.compare-label {
		font: 500 11px var(--map-font-mono);
		color: #c4bba7;
		text-transform: uppercase;
	}
</style>
