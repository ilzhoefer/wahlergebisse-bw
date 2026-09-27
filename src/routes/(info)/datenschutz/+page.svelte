<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import ProtectedEmail from '$lib/components/ProtectedEmail.svelte';

	let { data } = $props();
	const operator = $derived(data.operator);

	/** Promised in the text — the reverse proxy's log rotation must match. */
	const LOG_RETENTION_DAYS = 14;
	const AS_OF = '27.09.2026';
</script>

<svelte:head><title>{m.datenschutz_title()}</title></svelte:head>

<h1>{m.datenschutz_title()}</h1>

<h2>{m.datenschutz_controller_title()}</h2>
<p>{m.datenschutz_controller()}</p>
<p class="address">
	{operator.name}
	{#each operator.address as line (line)}<br />{line}{/each}
	<br /><ProtectedEmail encoded={operator.emailBase64} />
</p>

<h2>{m.datenschutz_overview_title()}</h2>
<p>{m.datenschutz_overview()}</p>

<h2>{m.datenschutz_hosting_title()}</h2>
<p>{m.datenschutz_hosting({ days: LOG_RETENTION_DAYS })}</p>

<h2>{m.datenschutz_cookies_title()}</h2>
<p>{m.datenschutz_cookies()}</p>
<ul>
	<li>{m.datenschutz_cookie_locale()}</li>
</ul>

<h2>{m.datenschutz_osm_title()}</h2>
<p>{m.datenschutz_osm()}</p>
<p>
	<a href="https://osmfoundation.org/wiki/Privacy_Policy" rel="noopener" target="_blank"
		>{m.datenschutz_osm_link()}</a
	>
</p>

<h2>{m.datenschutz_fonts_title()}</h2>
<p>{m.datenschutz_fonts()}</p>

<h2>{m.datenschutz_email_title()}</h2>
<p>{m.datenschutz_email()}</p>

<h2>{m.datenschutz_candidates_title()}</h2>
<p>{m.datenschutz_candidates()}</p>

<h2>{m.datenschutz_rights_title()}</h2>
<p>{m.datenschutz_rights()}</p>
<p>{m.datenschutz_complaint()}</p>

<p class="note">{m.datenschutz_as_of({ date: AS_OF })}</p>
