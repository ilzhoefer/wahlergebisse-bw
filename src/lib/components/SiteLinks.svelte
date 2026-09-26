<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { class: className = '' }: { class?: string } = $props();
</script>

<nav class="site-links {className}">
	<a href={resolve('/ueber')}>{m.nav_about()}</a>
	<a href={resolve('/impressum')}>{m.nav_impressum()}</a>
	<a href={resolve('/datenschutz')}>{m.nav_datenschutz()}</a>
</nav>

<style>
	.site-links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 12px;
	}
	.site-links a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
