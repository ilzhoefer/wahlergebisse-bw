<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import '$lib/components/map/theme.css';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>{m.admin_login_title()} · {m.map_brand_name()}</title>
</svelte:head>

<div class="map-root page">
	<form method="POST" use:enhance class="card">
		<div class="brand-block">
			<span class="logo">
				<span class="bar" style="height: 8px"></span>
				<span class="bar" style="height: 15px"></span>
				<span class="bar" style="height: 11px"></span>
			</span>
			<span class="wordmark">
				<span class="brand">{m.map_brand_name()}</span>
				<span class="map-lbl region">{m.admin_brand_subtitle()}</span>
			</span>
		</div>
		<h1 class="heading">{m.admin_login_title()}</h1>
		<label class="field">
			<span class="map-lbl">{m.admin_login_password_label()}</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input type="password" name="password" autocomplete="current-password" autofocus />
		</label>
		{#if form?.error === 'wrong_password'}
			<p class="err">{m.admin_login_error_wrong_password()}</p>
		{/if}
		<button type="submit" class="primary">{m.admin_login_submit()}</button>
		<a class="back" href="/">{m.nav_back_to_map()}</a>
	</form>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		box-sizing: border-box;
		color: var(--map-ink);
	}
	.card {
		width: 100%;
		max-width: 340px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 22px 22px 18px;
		background: var(--map-bg-surface);
		border: 1px solid rgba(33, 29, 24, 0.14);
		border-radius: 8px;
		box-shadow: var(--map-shadow-card);
	}
	.brand-block {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.logo {
		width: 26px;
		height: 26px;
		border-radius: 4px;
		background: var(--map-accent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2px;
		padding: 5px;
		box-sizing: border-box;
	}
	.bar {
		width: 4px;
		background: var(--map-on-dark);
		border-radius: 1px;
	}
	.wordmark {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}
	.brand {
		font-family: var(--map-font-heading);
		font-size: 15px;
		font-weight: 500;
	}
	.region {
		color: var(--map-accent);
		margin-top: 3px;
	}
	.heading {
		margin: 4px 0 0;
		font-family: var(--map-font-heading);
		font-size: 23px;
		font-weight: 500;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	input {
		padding: 8px 10px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font: 500 12.5px var(--map-font-body);
		color: var(--map-ink);
	}
	.err {
		margin: 0;
		font-size: 11.5px;
		font-weight: 500;
		color: var(--map-error-text);
	}
	.primary {
		padding: 11px 16px;
		border-radius: 6px;
		border: 1px solid var(--map-ink);
		background: var(--map-ink);
		color: var(--map-on-dark);
		font: 600 13px var(--map-font-body);
		cursor: pointer;
	}
	.back {
		align-self: center;
		font-size: 12px;
		font-weight: 500;
		color: var(--map-accent);
		text-decoration: none;
	}
	.back:hover {
		color: var(--map-accent-hover);
	}
</style>
