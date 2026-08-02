<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import * as m from '$lib/paraglide/messages';

	let { form }: { form: ActionData } = $props();
</script>

<div class="mx-auto max-w-sm space-y-4 p-6">
	<h1 class="text-xl font-semibold">{m.admin_login_title()}</h1>
	<form method="POST" use:enhance class="space-y-3">
		<label class="block text-sm">
			{m.admin_login_password_label()}
			<input
				type="password"
				name="password"
				autocomplete="current-password"
				class="mt-1 w-full rounded border p-1"
			/>
		</label>
		{#if form?.error === 'wrong_password'}
			<p class="text-sm text-red-600">{m.admin_login_error_wrong_password()}</p>
		{/if}
		<button type="submit" class="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
			{m.admin_login_submit()}
		</button>
	</form>
</div>
