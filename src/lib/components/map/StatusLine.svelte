<script lang="ts">
	interface Props {
		text: string;
	}
	let { text }: Props = $props();
</script>

<div class="status-line">
	<span class="map-lbl text">{text}</span>
</div>

<style>
	.status-line {
		position: absolute;
		bottom: 18px;
		left: 18px;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 3;
	}
	@media (max-width: 519px) {
		/* The legend takes the bottom edge on phones; the panel below repeats this line's info. */
		.status-line {
			display: none;
		}
	}
	.text {
		color: var(--map-ink-muted);
		background: rgba(255, 253, 248, 0.85);
		padding: 5px 8px;
		border-radius: 5px;
	}
</style>
