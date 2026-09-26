<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import ProtectedEmail from '$lib/components/ProtectedEmail.svelte';

	let { data } = $props();
	const operator = $derived(data.operator);
</script>

<svelte:head><title>{m.impressum_title()}</title></svelte:head>

<h1>{m.impressum_title()}</h1>

<h2>{m.impressum_provider()}</h2>
<p>
	{operator.name}
	{#each operator.address as line (line)}<br />{line}{/each}
</p>

<h2>{m.impressum_contact()}</h2>
<p>{m.impressum_email()}: <ProtectedEmail encoded={operator.emailBase64} /></p>

<h2>{m.impressum_responsible()}</h2>
<p>
	{operator.name}
	{#each operator.address as line (line)}<br />{line}{/each}
</p>

<h2>{m.impressum_liability_title()}</h2>
<p>{m.impressum_liability_content()}</p>
<p>{m.impressum_liability_links()}</p>
