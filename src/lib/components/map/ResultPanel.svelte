<script lang="ts">
	import SiteLinks from '$lib/components/SiteLinks.svelte';
	import * as m from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import SeatChart, { type SeatParty } from './SeatChart.svelte';

	/** A titled group of people shown above the party rows — the Wahlkreis's Bundestag mandates. */
	export interface PeopleGroup {
		title: string;
		people: { name: string; detail: string; color: string | null }[];
		note?: string | null;
	}

	export interface PanelRow {
		key: string;
		color: string | null;
		primary: string;
		secondary?: string | null;
		pct: string;
		seats?: string | null;
		widthPercent: number;
		/** Veränderung: the comparison year's bar, drawn pale above the current one (same scale). */
		oldWidthPercent?: number | null;
		/** Renders this row as a plain clickable label instead of a party row (swatch + bar) — used for
		 * the "Sonstige" (others) expand/collapse toggle. */
		onToggle?: () => void;
		/** Makes the party name a toggle that lists the list's candidates below the row. */
		onSelect?: () => void;
		expanded?: boolean;
		/** The open row's candidates, votes pre-formatted; null while loading. */
		candidates?: { name: string; votes: string; elected: boolean }[] | null;
	}

	interface Props {
		levelLabel: string;
		code: string;
		canGoUp: boolean;
		parentName: string;
		onGoUp: () => void;
		name: string;
		sub: string;
		turnoutLabel: string;
		turnoutValue: string;
		eligibleLabel: string;
		eligibleValue: string;
		/** Empty hides the stat. */
		unitLabel: string;
		unitValue: string;
		rowsHeadingLeft: string;
		rowsHeadingRight: string;
		rows: PanelRow[];
		footnote: string;
		/** Subtle warnings under the stats, e.g. that some Gemeinden in this area have no results. */
		notes?: string[];
		/** Every party's seats (not just the listed rows) — shown as a parliament arc when set. */
		seats?: SeatParty[] | null;
		/** Short "what does this mode tell me" text under the rows. */
		explanation?: string | null;
		/** Rendered above the header (the search box). */
		children?: Snippet;
		peopleGroups?: PeopleGroup[];
		/** Values shown as vote counts instead of shares; the switch only appears with `onToggleAbsolute`. */
		absolute?: boolean;
		onToggleAbsolute?: () => void;
	}

	let {
		levelLabel,
		code,
		canGoUp,
		parentName,
		onGoUp,
		name,
		sub,
		turnoutLabel,
		turnoutValue,
		eligibleLabel,
		eligibleValue,
		unitLabel,
		unitValue,
		rowsHeadingLeft,
		rowsHeadingRight,
		rows,
		footnote,
		notes = [],
		seats = null,
		explanation = null,
		children,
		peopleGroups = [],
		absolute = false,
		onToggleAbsolute
	}: Props = $props();
</script>

{#snippet bars(r: PanelRow)}
	<!-- With a comparison value ("ghost bar"): the earlier result as a pale bar behind the current one,
	     plus a tick at the earlier value — a loss shows as a pale tail, a gain as colour past the tick. -->
	<div class="bar-track">
		{#if r.oldWidthPercent != null}
			<div class="bar-old" style="background: {r.color}; width: {r.oldWidthPercent}%"></div>
		{/if}
		<div class="bar-fill" style="background: {r.color}; width: {r.widthPercent}%"></div>
		{#if r.oldWidthPercent != null}
			<div class="bar-tick" style="left: {r.oldWidthPercent}%"></div>
		{/if}
	</div>
{/snippet}

<div class="panel">
	{@render children?.()}
	<div class="header">
		<div class="header-top">
			<span class="map-lbl" style="color: var(--map-ink-muted)">{levelLabel} · {code}</span>
			{#if canGoUp}
				<button type="button" class="up-link" onclick={onGoUp}
					>{m.map_panel_up_to({ parent: parentName })}</button
				>
			{/if}
		</div>
		<h2 class="name">{name}</h2>
		<div class="sub">{sub}</div>
	</div>

	<div class="stats">
		<div class="stat">
			<div class="map-lbl stat-label">{turnoutLabel}</div>
			<div class="stat-value">{turnoutValue}</div>
		</div>
		<div class="stat">
			<div class="map-lbl stat-label">{eligibleLabel}</div>
			<div class="stat-value">{eligibleValue}</div>
		</div>
		{#if unitLabel}
			<div class="stat">
				<div class="map-lbl stat-label">{unitLabel}</div>
				<div class="stat-value">{unitValue}</div>
			</div>
		{/if}
	</div>

	{#each notes as note (note)}
		<p class="note">{note}</p>
	{/each}

	{#each peopleGroups as group (group.title)}
		<div class="people">
			<div class="map-lbl" style="color: var(--map-ink-muted)">{group.title}</div>
			{#each group.people as p (p.name)}
				<div class="person">
					<span class="swatch" style="background: {p.color ?? '#cfc8ba'}"></span>
					<span class="person-name">{p.name}</span>
					<span class="person-detail">{p.detail}</span>
				</div>
			{/each}
			{#if group.note}
				<p class="people-note">{group.note}</p>
			{/if}
		</div>
	{/each}

	<div class="rows-heading">
		<span class="map-lbl" style="color: var(--map-ink)">{rowsHeadingLeft}</span>
		<span class="heading-right">
			{#if rowsHeadingRight}
				<span class="map-lbl" style="color: var(--map-ink-muted)">{rowsHeadingRight}</span>
			{/if}
			{#if onToggleAbsolute}
				<span class="value-switch" role="group" aria-label={m.map_values_switch_label()}>
					<button
						type="button"
						class="map-lbl"
						class:active={!absolute}
						aria-pressed={!absolute}
						onclick={() => absolute && onToggleAbsolute()}
						>{m.map_rows_heading_right_anteil()}</button
					>
					<button
						type="button"
						class="map-lbl"
						class:active={absolute}
						aria-pressed={absolute}
						onclick={() => !absolute && onToggleAbsolute()}>{m.map_values_votes()}</button
					>
				</span>
			{/if}
		</span>
	</div>

	<div class="rows">
		{#if seats}
			<SeatChart parties={seats} />
		{/if}
		{#each rows as r (r.key)}
			{#if r.onToggle}
				<button type="button" class="row row-toggle" onclick={r.onToggle}>
					{#if r.color}
						<div class="row-top">
							<span class="swatch" style="background: {r.color}"></span>
							<span class="labels"><span class="primary">{r.primary}</span></span>
							<span class="pct">{r.pct}</span>
							{#if r.seats}
								<span class="seats">{r.seats}</span>
							{/if}
						</div>
						{@render bars(r)}
					{:else}
						<span class="toggle-label">{r.primary}</span>
					{/if}
				</button>
			{:else}
				<div class="row">
					<div class="row-top">
						<span class="swatch" style="background: {r.color}"></span>
						<span class="labels">
							{#if r.onSelect}
								<button
									type="button"
									class="primary primary-button"
									aria-expanded={r.expanded}
									title={m.map_panel_candidates_show()}
									onclick={r.onSelect}
									>{r.primary}<span class="chevron" aria-hidden="true"
										>{r.expanded ? '▾' : '▸'}</span
									></button
								>
							{:else}
								<span class="primary">{r.primary}</span>
							{/if}
							{#if r.secondary}
								<span class="map-lbl secondary">{r.secondary}</span>
							{/if}
						</span>
						{#if onToggleAbsolute && r.pct}
							<!-- Clicking a value flips the whole list between shares and vote counts. -->
							<button
								type="button"
								class="pct pct-button"
								title={absolute ? m.map_values_show_shares() : m.map_values_show_votes()}
								onclick={onToggleAbsolute}>{r.pct}</button
							>
						{:else}
							<span class="pct">{r.pct}</span>
						{/if}
						{#if r.seats}
							<span class="seats">{r.seats}</span>
						{/if}
					</div>
					{@render bars(r)}
					{#if r.expanded}
						<div class="candidates">
							{#if r.candidates == null}
								<span class="cand-note">{m.map_panel_candidates_loading()}</span>
							{:else if r.candidates.length === 0}
								<span class="cand-note">{m.map_panel_candidates_none()}</span>
							{:else}
								<div class="map-lbl cand-heading">
									<span>{m.map_panel_candidates_heading()}</span>
									<span>{m.map_values_votes()}</span>
								</div>
								{#each r.candidates as c, i (`${i}:${c.name}`)}
									<div class="cand">
										<span class="cand-name">{c.name}</span>
										{#if c.elected}
											<span class="cand-elected" title={m.map_panel_candidate_elected()}
												>✓<span class="sr-only">{m.map_panel_candidate_elected()}</span></span
											>
										{/if}
										<span class="cand-votes">{c.votes}</span>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
		{#if explanation}
			<p class="explanation">{explanation}</p>
		{/if}
	</div>

	<div class="footer">
		<span class="footnote">{footnote}</span>
		<a class="csv" href={resolve('/daten')}>{m.map_panel_csv_button()}</a>
	</div>
	<SiteLinks class="site-links-row" />
</div>

<style>
	.panel {
		width: 340px;
		min-width: 280px;
		flex: 0 1 340px;
		background: var(--map-bg-surface);
		border-right: 1px solid var(--map-border-strong);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--map-font-body);
	}
	.header {
		padding: 18px 20px 15px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
	}
	.up-link {
		font-family: var(--map-font-body);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--map-accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.name {
		margin: 0 0 4px;
		font-family: var(--map-font-heading);
		font-size: 24px;
		font-weight: 500;
		color: var(--map-ink);
		line-height: 1.1;
	}
	.sub {
		font-size: 12px;
		color: var(--map-ink-3);
	}
	.stats {
		padding: 14px 20px;
		display: flex;
		flex-wrap: wrap;
		column-gap: 16px;
		row-gap: 12px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.stat-label {
		color: var(--map-ink-muted);
		margin-bottom: 3px;
	}
	.stat-value {
		font: 500 19px var(--map-font-mono);
		color: var(--map-ink);
	}
	.rows-heading {
		padding: 14px 20px 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 6px 10px;
	}
	.heading-right {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}
	.value-switch {
		display: flex;
		padding: 2px;
		border-radius: 6px;
		background: var(--map-bg-surface-sunken);
	}
	.value-switch button {
		border: none;
		background: none;
		padding: 3px 7px;
		border-radius: 4px;
		cursor: pointer;
		color: var(--map-ink-muted);
	}
	.value-switch button.active {
		background: var(--map-bg-surface);
		color: var(--map-ink);
		box-shadow: 0 0 0 1px var(--map-border-soft);
	}
	.pct-button {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		border-bottom: 1px dotted transparent;
	}
	.pct-button:hover,
	.pct-button:focus-visible {
		border-bottom-color: var(--map-ink-muted);
	}
	.rows {
		padding: 0 20px 14px;
		flex: 1;
		min-height: 0;
		overflow: hidden auto;
		display: flex;
		flex-direction: column;
		gap: 11px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.row-toggle {
		display: flex;
		flex-direction: column;
		gap: 5px;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.toggle-label {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-accent);
	}
	.toggle-label:hover {
		color: var(--map-accent-hover);
	}
	.row-top {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		flex: none;
		border: 0.5px solid var(--map-swatch-border);
		align-self: center;
	}
	.labels {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.primary {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--map-ink);
	}
	.secondary {
		color: var(--map-ink-muted);
		margin-top: 2px;
	}
	.primary-button {
		display: inline-flex;
		align-items: baseline;
		gap: 5px;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}
	.primary-button:hover {
		color: var(--map-accent);
	}
	.chevron {
		font-size: 10px;
		color: var(--map-ink-muted);
	}
	.candidates {
		margin: 8px 0 4px;
		padding: 8px 10px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-a);
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 280px;
		overflow-y: auto;
	}
	.cand-heading {
		display: flex;
		justify-content: space-between;
		color: var(--map-ink-muted);
		margin-bottom: 2px;
	}
	.cand {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 12px;
		color: var(--map-ink-2);
	}
	.cand-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cand-elected {
		flex: none;
		font-weight: 700;
		color: var(--map-success-text);
	}
	.cand-votes {
		flex: none;
		font: 500 11.5px var(--map-font-mono);
		color: var(--map-ink);
	}
	.cand-note {
		font-size: 11.5px;
		color: var(--map-ink-muted);
	}
	.pct {
		font: 500 12.5px var(--map-font-mono);
		color: var(--map-ink);
	}
	.seats {
		font: 400 11px var(--map-font-mono);
		color: var(--map-ink-muted);
		width: 18px;
		text-align: right;
	}
	.bar-old,
	.bar-tick {
		position: absolute;
		top: 0;
		height: 100%;
	}
	.bar-old {
		left: 0;
		opacity: 0.35;
	}
	.bar-tick {
		width: 2px;
		margin-left: -1px;
		background: var(--map-bg-surface);
	}
	.bar-track {
		position: relative;
		height: 6px;
		border-radius: 2px;
		background: var(--map-bg-surface-sunken);
		overflow: hidden;
	}
	.bar-fill {
		position: relative; /* paints above .bar-old (DOM order among positioned boxes) */
		height: 100%;
	}
	.footer {
		padding: 13px 20px 17px;
		border-top: 1px solid var(--map-border-soft);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.people {
		padding: 12px 20px;
		border-bottom: 1px solid var(--map-border-soft);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.person {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.person .swatch {
		align-self: center;
	}
	.person-name {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--map-ink);
	}
	.person-detail {
		font: 500 11.5px var(--map-font-mono);
		color: var(--map-ink-3);
		white-space: nowrap;
	}
	.people-note {
		white-space: pre-line; /* note + source line */
		margin: 2px 0 0;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--map-ink-3);
	}
	.note {
		margin: 0;
		padding: 8px 20px 8px 17px;
		border-left: 3px solid var(--map-accent);
		border-bottom: 1px solid var(--map-border-soft);
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--map-ink-3);
	}
	.explanation {
		white-space: pre-line; /* messages use \n for paragraph breaks */
		margin: 4px 0 0;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.footnote {
		flex: 1;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--map-ink-3);
	}
	.panel :global(.site-links-row) {
		padding: 0 20px 12px;
		color: var(--map-ink-3);
		font-size: 11.5px;
	}
	.csv {
		padding: 9px 12px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: #fff;
		color: var(--map-ink-2);
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
		flex: none;
	}
</style>
