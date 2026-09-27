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
	.text {
		color: var(--map-ink-muted);
		background: rgba(255, 253, 248, 0.85);
		padding: 5px 8px;
		border-radius: 5px;
	}
</style>
