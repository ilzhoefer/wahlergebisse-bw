<script lang="ts">
	type Tone = 'running' | 'done' | 'error';

	let {
		kicker,
		label,
		current,
		total,
		tone
	}: { kicker: string; label: string; current: number; total: number; tone: Tone } = $props();

	const percent = $derived(total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);

	const barColor: Record<Tone, string> = {
		running: 'bg-blue-600',
		done: 'bg-green-600',
		error: 'bg-red-600'
	};
</script>

<div class="space-y-1">
	<div class="flex items-baseline justify-between gap-2">
		<span class="flex min-w-0 items-baseline gap-1.5 text-xs">
			<span class="shrink-0 font-medium tracking-wide text-gray-500 uppercase">{kicker}</span>
			<span class="truncate text-gray-700">{label}</span>
		</span>
		<span class="shrink-0 text-xs text-gray-500 tabular-nums">{current}/{total}</span>
	</div>
	<div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
		<div
			class="h-full rounded-full transition-[width] duration-300 ease-out {barColor[tone]} {tone ===
			'running'
				? 'animate-pulse'
				: ''}"
			style="width: {percent}%"
		></div>
	</div>
</div>
