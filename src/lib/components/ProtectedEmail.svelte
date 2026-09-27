<script lang="ts">
	import { onMount } from 'svelte';

	let { encoded }: { encoded: string } = $props();

	// Filled in only after hydration, so the server-rendered HTML never contains the plain address.
	let email = $state('');
	onMount(() => {
		email = atob(encoded);
	});
</script>

{#if email}<a href="mailto:{email}">{email}</a>{/if}
