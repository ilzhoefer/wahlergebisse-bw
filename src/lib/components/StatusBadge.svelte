<script lang="ts">
	type Status = 'running' | 'done' | 'error';

	let { status, label }: { status: Status; label: string } = $props();

	const styles: Record<Status, string> = {
		running: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
		done: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200',
		error: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
	};
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap {styles[
		status
	]}"
>
	{#if status === 'running'}
		<svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
			></circle>
			<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			></path>
		</svg>
	{:else if status === 'done'}
		<svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
			<path
				fill-rule="evenodd"
				d="M16.704 5.29a1 1 0 010 1.415l-7.005 7a1 1 0 01-1.414 0l-3.005-3a1 1 0 111.414-1.414l2.298 2.297 6.298-6.298a1 1 0 011.414 0z"
				clip-rule="evenodd"
			></path>
		</svg>
	{:else}
		<svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
			<path
				fill-rule="evenodd"
				d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v3a1 1 0 11-2 0V9zm1-4a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 5z"
				clip-rule="evenodd"
			></path>
		</svg>
	{/if}
	{label}
</span>
