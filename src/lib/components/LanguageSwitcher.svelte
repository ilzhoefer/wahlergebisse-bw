<script lang="ts">
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

	const labels: Record<string, string> = { de: 'DE', en: 'EN' };
</script>

<div class="flex gap-1 text-xs">
	{#each locales as locale (locale)}
		<button
			type="button"
			class="rounded px-1.5 py-0.5 {getLocale() === locale
				? 'bg-blue-700 text-white'
				: 'text-blue-700 underline'}"
			onclick={() => setLocale(locale)}
		>
			{labels[locale] ?? locale}
		</button>
	{/each}
</div>
