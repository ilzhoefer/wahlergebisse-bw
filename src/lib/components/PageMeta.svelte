<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	/** Title, description and Open Graph tags — what search results and link previews show. */
	let { title, description }: { title: string; description: string } = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="{m.map_brand_name()} {m.map_brand_region()}" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={page.url.href} />
	<meta name="twitter:card" content="summary" />
</svelte:head>
