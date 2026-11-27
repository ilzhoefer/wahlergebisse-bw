<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { formatBerlin, toBerlinLocal } from '#lib/berlinTime.ts';
	import * as m from '#lib/paraglide/messages.js';

	let { data, form } = $props();
	const s = $derived(data.schedule);

	/** Defaults for a new schedule: today, 18:00 until 02:00, every 15 minutes. */
	const today = new Date().toISOString().slice(0, 10);
	const defaults = $derived({
		electionType: s?.electionType ?? data.electionTypes[0]?.electionType ?? 0,
		date: s?.date ?? today,
		intervalMinutes: s?.intervalMinutes ?? 15,
		startsAt: s ? toBerlinLocal(s.startsAt) : `${today}T18:00`,
		endsAt: s ? toBerlinLocal(s.endsAt) : `${today}T23:59`,
		active: s?.active ?? true
	});

	const statusText = (status: string) =>
		status === 'running'
			? m.schedule_run_running()
			: status === 'done'
				? m.schedule_run_done()
				: m.schedule_run_error();
</script>

<svelte:head>
	<title>{m.schedule_title()} · {m.admin_title()}</title>
</svelte:head>

<div class="map-root page">
	<SiteHeader kicker={m.schedule_title()}>
		<a class="admin-link" href={resolve('admin')}>{m.admin_title()}</a>
	</SiteHeader>

	<main class="layout">
		<section class="card">
			<h1>{m.schedule_title()}</h1>
			<p class="hint">{m.schedule_intro()}</p>

			<div class="status" class:on={data.next !== null}>
				{#if data.next}
					{m.schedule_status_next({ time: formatBerlin(new Date(data.next)) })}
				{:else if s?.active}
					{m.schedule_status_outside()}
				{:else}
					{m.schedule_status_off()}
				{/if}
			</div>

			<form method="POST" action="?/save" use:enhance class="fields">
				<label>
					<span class="map-lbl">{m.admin_crawl_electiontype_label()}</span>
					<select class="input" name="electionType" value={defaults.electionType}>
						{#each data.electionTypes as t (t.electionType)}
							<option value={t.electionType}>{t.electionDescription ?? t.electionType}</option>
						{/each}
					</select>
				</label>
				<label>
					<span class="map-lbl">{m.schedule_date()}</span>
					<input class="input" type="date" name="date" value={defaults.date} required />
				</label>
				<label>
					<span class="map-lbl">{m.schedule_from()}</span>
					<input
						class="input"
						type="datetime-local"
						name="startsAt"
						value={defaults.startsAt}
						required
					/>
				</label>
				<label>
					<span class="map-lbl">{m.schedule_until()}</span>
					<input
						class="input"
						type="datetime-local"
						name="endsAt"
						value={defaults.endsAt}
						required
					/>
				</label>
				<label>
					<span class="map-lbl">{m.schedule_interval()}</span>
					<input
						class="input"
						type="number"
						name="intervalMinutes"
						min="5"
						max="1440"
						value={defaults.intervalMinutes}
						required
					/>
				</label>
				<label class="check">
					<input type="checkbox" name="active" checked={defaults.active} />
					{m.schedule_active()}
				</label>
				<p class="hint">{m.schedule_timezone_note()}</p>
				{#if form?.error}<p class="err">{m.schedule_invalid()}</p>{/if}
				{#if form?.saved}<p class="ok">{m.schedule_saved()}</p>{/if}
				<div class="buttons">
					<button type="submit" class="primary">{m.schedule_save()}</button>
					{#if s?.active}
						<button type="submit" formaction="?/stop" class="secondary">{m.schedule_stop()}</button>
					{/if}
				</div>
			</form>
		</section>

		{#if data.runs.length}
			<section class="card">
				<h2>{m.schedule_runs()}</h2>
				<ul class="runs">
					{#each data.runs as r (r.id)}
						<li>
							<span>{formatBerlin(new Date(r.startedAt))}</span>
							<span class="run-status {r.status}">{statusText(r.status)}</span>
							{#if r.finishedAt}
								<span class="muted">
									{Math.round(
										(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 60000
									)} min
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		color: var(--map-ink);
	}
	.admin-link {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--map-accent);
		text-decoration: none;
	}
	.layout {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card {
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		box-shadow: var(--map-shadow-card);
		padding: 20px 24px;
	}
	h1 {
		margin: 0 0 6px;
		font-family: var(--map-font-heading);
		font-size: 28px;
		font-weight: 500;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 15px;
		font-weight: 600;
	}
	.hint {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--map-ink-3);
	}
	.status {
		margin: 14px 0;
		padding: 9px 12px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		background: var(--map-bg-surface-sunken);
		color: var(--map-ink-2);
	}
	.status.on {
		background: var(--map-success-bg);
		color: var(--map-success-text);
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px 16px;
	}
	@media (max-width: 559px) {
		.fields {
			grid-template-columns: 1fr;
		}
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--map-ink-muted);
	}
	label.check {
		flex-direction: row;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--map-ink);
		grid-column: 1 / -1;
	}
	.fields .hint,
	.err,
	.ok,
	.buttons {
		grid-column: 1 / -1;
	}
	.input {
		font: 500 13px var(--map-font-body);
		padding: 7px 8px;
		border-radius: 6px;
		border: 1px solid var(--map-border-strong);
		background: #fff;
		color: var(--map-ink);
	}
	.err,
	.ok {
		margin: 0;
		font-size: 13px;
	}
	.err {
		color: var(--map-error-text);
	}
	.ok {
		color: var(--map-success-text);
	}
	.buttons {
		display: flex;
		gap: 10px;
	}
	button {
		font: 600 13px var(--map-font-body);
		padding: 9px 14px;
		border-radius: 6px;
		cursor: pointer;
	}
	.primary {
		background: var(--map-ink);
		color: var(--map-on-dark);
		border: 1px solid var(--map-ink);
	}
	.secondary {
		background: #fff;
		color: var(--map-ink-2);
		border: 1px solid var(--map-border-strong);
	}
	.runs {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12.5px;
	}
	.runs li {
		display: flex;
		gap: 12px;
	}
	.run-status.done {
		color: var(--map-success-text);
	}
	.run-status.error {
		color: var(--map-error-text);
	}
	.run-status.running {
		color: var(--map-accent);
	}
	.muted {
		color: var(--map-ink-muted);
	}
</style>
