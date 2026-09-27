<script lang="ts">
	interface Props {
		text: string;
	}
	let { text }: Props = $props();
</script>

<div class="mode-badge">
	<span class="dot"></span>
	<span class="text">{text}</span>
</div>

<style>
	.mode-badge {
		position: absolute;
		top: 14px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 7px;
		background: var(--map-ink);
		border-radius: 20px;
		padding: 5px 12px;
		z-index: 4;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--map-progress-running);
	}
	.text {
		font: 500 11px var(--map-font-mono);
		color: var(--map-on-dark);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
</style>
