<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

	const localeLabels: Record<string, string> = { de: 'DE', en: 'EN' };

	export interface Tab {
		key: string;
		label: string;
		active: boolean;
		onClick: () => void;
	}
	export interface SelectOption {
		value: string;
		label: string;
	}

	interface Props {
		electionOptions: SelectOption[];
		selectedElectionType: string;
		onElectionChange: (value: string) => void;
		dateOptions: SelectOption[];
		selectedDate: string;
		onDateChange: (value: string) => void;
		/** null when the current election only has one vote (no Erst-/Zweitstimme toggle). */
		stimmeTabs: Tab[] | null;
		ebeneOptions: SelectOption[];
		/** '' while the Wahlkreis view is active (no rs-hierarchy level applies then). */
		selectedEbene: string;
		onEbeneChange: (value: string) => void;
		modusTabs: Tab[];
		/** null outside Hochburg mode. */
		hochburgPartyOptions: SelectOption[] | null;
		selectedHbParty: string;
		hbPartyColor: string;
		onHbPartyChange: (value: string) => void;
		/** Comparison dates for Veränderung; null in every other mode. */
		compareOptions: SelectOption[] | null;
		selectedCompare: string;
		onCompareChange: (value: string) => void;
		onReset: () => void;
	}

	let {
		electionOptions,
		selectedElectionType,
		onElectionChange,
		dateOptions,
		selectedDate,
		onDateChange,
		stimmeTabs,
		ebeneOptions,
		selectedEbene,
		onEbeneChange,
		modusTabs,
		hochburgPartyOptions,
		selectedHbParty,
		hbPartyColor,
		onHbPartyChange,
		compareOptions,
		selectedCompare,
		onCompareChange,
		onReset
	}: Props = $props();
</script>

<div class="toolbar">
	<div class="brand-block">
		<span class="logo">
			<span class="bar" style="height: 8px"></span>
			<span class="bar" style="height: 15px"></span>
			<span class="bar" style="height: 11px"></span>
		</span>
		<span class="wordmark">
			<span class="brand">{m.map_brand_name()}</span>
			<span class="map-lbl region">{m.map_brand_region()}</span>
		</span>
	</div>

	<div class="controls">
		<select
			class="select select-main"
			value={selectedElectionType}
			onchange={(e) => onElectionChange(e.currentTarget.value)}
		>
			{#each electionOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
		<select
			class="select select-mono"
			value={selectedDate}
			onchange={(e) => onDateChange(e.currentTarget.value)}
		>
			{#each dateOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
		{#if compareOptions}
			<!-- Veränderung: "23.2.2025 ggü. 26.9.2021" — the two dates side by side. -->
			<span class="map-lbl" style="color: var(--map-ink-muted)">{m.map_compare_label()}</span>
			<select
				class="select select-mono"
				value={selectedCompare}
				onchange={(e) => onCompareChange(e.currentTarget.value)}
			>
				{#each compareOptions as o (o.value)}
					<option value={o.value}>{o.label}</option>
				{/each}
			</select>
		{/if}

		{#if stimmeTabs}
			<div class="segmented" style="margin-left: 2px">
				{#each stimmeTabs as t (t.key)}
					<button type="button" class="pill" class:active={t.active} onclick={t.onClick}
						>{t.label}</button
					>
				{/each}
			</div>
		{/if}

		<span class="divider"></span>

		<span class="ebene">
			<span class="map-lbl" style="color: var(--map-ink-muted)">{m.map_ebene_label()}</span>
			<select
				class="ebene-select"
				value={selectedEbene}
				onchange={(e) => onEbeneChange(e.currentTarget.value)}
			>
				{#if selectedEbene === ''}
					<option value=""></option>
				{/if}
				{#each ebeneOptions as o (o.value)}
					<option value={o.value}>{o.label}</option>
				{/each}
			</select>
		</span>

		<div class="segmented">
			{#each modusTabs as t (t.key)}
				<button type="button" class="pill" class:active={t.active} onclick={t.onClick}
					>{t.label}</button
				>
			{/each}
		</div>

		{#if hochburgPartyOptions}
			<select
				class="select select-party"
				style="border-color: {hbPartyColor}"
				value={selectedHbParty}
				onchange={(e) => onHbPartyChange(e.currentTarget.value)}
			>
				{#each hochburgPartyOptions as o (o.value)}
					<option value={o.value}>{o.label}</option>
				{/each}
			</select>
		{/if}
	</div>

	<div class="aside">
		<button type="button" class="reset" onclick={onReset}>{m.map_reset()}</button>
		<div class="segmented locale">
			{#each locales as locale (locale)}
				<button
					type="button"
					class="pill"
					class:active={getLocale() === locale}
					onclick={() => setLocale(locale)}>{localeLabels[locale] ?? locale}</button
				>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Brand | controls | aside. Only the controls column wraps, so Zurücksetzen + DE/EN always stay
	   pinned top-right instead of being the first thing pushed onto a lonely second row. */
	.toolbar {
		flex: none;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas: 'brand controls aside';
		align-items: center;
		gap: 10px 14px;
		padding: 10px 14px;
		min-height: 60px;
		box-sizing: border-box;
		background: var(--map-bg-surface);
		border-bottom: 1px solid var(--map-border-strong);
		font-family: var(--map-font-body);
	}
	.brand-block {
		grid-area: brand;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.aside {
		grid-area: aside;
		align-self: start;
		display: flex;
		align-items: center;
		gap: 14px;
		/* matches a control's height so it lines up with the first controls row */
		min-height: 34px;
	}
	.locale .pill {
		padding: 3px 8px;
		font-size: 11.5px;
	}
	@media (max-width: 720px) {
		.toolbar {
			grid-template-columns: auto auto;
			grid-template-areas: 'brand aside' 'controls controls';
			justify-content: space-between;
		}
	}
	.logo {
		width: 26px;
		height: 26px;
		flex: none;
		border-radius: 4px;
		background: var(--map-accent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2px;
		padding: 5px;
		box-sizing: border-box;
	}
	.bar {
		width: 4px;
		background: var(--map-on-dark);
		border-radius: 1px;
	}
	.wordmark {
		display: flex;
		flex-direction: column;
		line-height: 1;
		padding-right: 13px;
		border-right: 1px solid var(--map-border-soft);
	}
	.brand {
		font-family: var(--map-font-heading);
		font-size: 15px;
		font-weight: 500;
		color: var(--map-ink);
	}
	.region {
		color: var(--map-accent);
		margin-top: 3px;
	}
	.controls {
		grid-area: controls;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.select {
		padding: 6px 9px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}
	.select-main {
		font: 600 12.5px var(--map-font-body);
		color: var(--map-ink);
	}
	.select-mono {
		font: 500 12px var(--map-font-mono);
		color: var(--map-ink-2);
	}
	.select-party {
		padding: 5px 8px;
		font: 600 12px var(--map-font-body);
		color: var(--map-ink);
	}
	.divider {
		width: 1px;
		height: 22px;
		background: var(--map-border-soft);
		margin: 0 3px;
	}
	.ebene {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 6px 10px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-ink);
	}
	.ebene-select {
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.ebene-select:disabled {
		cursor: default;
		opacity: 0.7;
	}
	.segmented {
		display: flex;
		padding: 2px;
		background: var(--map-bg-surface-sunken);
		border-radius: 7px;
	}
	.pill {
		font-family: var(--map-font-body);
		padding: 5px 11px;
		border-radius: 5px;
		font-size: 12.5px;
		font-weight: 500;
		background: transparent;
		color: var(--map-ink-3);
		border: none;
		cursor: pointer;
	}
	.pill.active {
		background: var(--map-ink);
		color: var(--map-on-dark);
		font-weight: 600;
	}
	.reset {
		font-family: var(--map-font-body);
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-accent);
		background: none;
		border: none;
		cursor: pointer;
	}
	.reset:hover {
		color: var(--map-accent-hover);
	}
</style>
