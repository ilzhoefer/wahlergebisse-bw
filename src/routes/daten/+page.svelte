<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let selectedCities = $state<number[]>(data.cities.map((c) => c.rs));
	let selectedElectionKey = $state<string>(
		data.elections[0] ? `${data.elections[0].electionType}|${data.elections[0].date}` : ''
	);
	const selectedElection = $derived(
		data.elections.find((e) => `${e.electionType}|${e.date}` === selectedElectionKey)
	);

	let wantMeta = $state(true);
	let wantAggregate = $state(true);
	let wantPs = $state(true);
	let wantMetaPs = $state(true);
	let person = $state(true);

	function selectAllCities() {
		selectedCities = data.cities.map((c) => c.rs);
	}
	function selectNoCities() {
		selectedCities = [];
	}
</script>

<div class="mx-auto max-w-2xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold">{m.daten_title()}</h1>
		<a href={resolve('/')} class="text-sm text-blue-700 underline">{m.nav_back_to_map()}</a>
	</div>
	<p class="text-sm text-gray-600">{m.daten_intro()}</p>

	<form method="POST" action="/daten/export" class="space-y-5">
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">{m.daten_gemeinden_legend()}</legend>
			<div class="flex gap-3 text-xs">
				<button type="button" class="text-blue-700 underline" onclick={selectAllCities}
					>{m.daten_select_all()}</button
				>
				<button type="button" class="text-blue-700 underline" onclick={selectNoCities}
					>{m.daten_select_none()}</button
				>
			</div>
			<select
				multiple
				bind:value={selectedCities}
				class="h-48 w-full rounded border p-1"
				name="rs_select"
			>
				{#each data.cities as c (c.rs)}
					<option value={c.rs}>{c.name}</option>
				{/each}
			</select>
			{#each selectedCities as rs (rs)}
				<input type="hidden" name="rs" value={rs} />
			{/each}
		</fieldset>

		<label class="block text-sm">
			{m.daten_wahl_label()}
			<select bind:value={selectedElectionKey} class="mt-1 w-full rounded border p-1">
				{#each data.elections as e (`${e.electionType}|${e.date}`)}
					<option value={`${e.electionType}|${e.date}`}>{e.label}</option>
				{/each}
			</select>
		</label>
		<input type="hidden" name="electionType" value={selectedElection?.electionType ?? ''} />
		<input type="hidden" name="date" value={selectedElection?.date ?? ''} />

		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">{m.daten_datenarten_legend()}</legend>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="meta" bind:checked={wantMeta} />
				{m.daten_meta_label()}
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="aggregate" bind:checked={wantAggregate} />
				{m.daten_aggregate_label()}
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="ps" bind:checked={wantPs} />
				{m.daten_ps_label()}
			</label>
			{#if wantPs && selectedElection?.supportsPersonToggle}
				<label class="ml-6 flex items-center gap-2 text-sm text-gray-700">
					<input type="checkbox" name="person" bind:checked={person} />
					{m.daten_person_label()}
				</label>
			{/if}
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="metaPs" bind:checked={wantMetaPs} />
				{m.daten_meta_ps_label()}
			</label>
		</fieldset>

		<button type="submit" class="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
			{m.daten_submit()}
		</button>
	</form>
</div>
