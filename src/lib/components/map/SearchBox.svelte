<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	export interface SearchHit {
		id: string;
		primary: string;
		secondary: string;
		pick: () => void;
	}

	interface Props {
		/** Instant, client-side matches (places). */
		findPlaces: (q: string) => SearchHit[];
		/** Server-side matches (elected candidates), fetched debounced from 3 characters on. */
		findPeople: (q: string) => Promise<SearchHit[]>;
	}

	let { findPlaces, findPeople }: Props = $props();

	const uid = $props.id();
	let query = $state('');
	let open = $state(false);
	let active = $state(-1);
	let people = $state<SearchHit[]>([]);
	let input: HTMLInputElement | undefined = $state();

	const places = $derived(findPlaces(query));
	const hits = $derived([...places, ...people]);

	// Debounced people lookup; a stale response (query changed meanwhile) is dropped.
	$effect(() => {
		const q = query.trim();
		people = [];
		if (q.length < 3) return;
		const timer = setTimeout(() => {
			findPeople(q).then((result) => {
				if (query.trim() === q) people = result;
			});
		}, 250);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		void hits;
		active = hits.length > 0 ? 0 : -1;
	});

	function choose(hit: SearchHit) {
		hit.pick();
		query = '';
		open = false;
		input?.blur();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (hits.length === 0) return;
			e.preventDefault();
			open = true;
			const step = e.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + hits.length) % hits.length;
		} else if (e.key === 'Enter' && open && hits[active]) {
			e.preventDefault();
			choose(hits[active]);
		} else if (e.key === 'Escape') {
			if (open) open = false;
			else query = '';
		}
	}

	const showList = $derived(open && query.trim().length >= 2);
</script>

<div class="search">
	<input
		bind:this={input}
		bind:value={query}
		class="input"
		type="search"
		role="combobox"
		autocomplete="off"
		spellcheck="false"
		placeholder={m.map_search_placeholder()}
		aria-label={m.map_search_label()}
		aria-expanded={showList}
		aria-controls="{uid}-list"
		aria-autocomplete="list"
		aria-activedescendant={showList && active >= 0 ? `${uid}-${active}` : undefined}
		oninput={() => (open = true)}
		onfocus={() => (open = true)}
		onblur={() => (open = false)}
		onkeydown={onKeydown}
	/>
	{#if showList}
		<ul class="list" id="{uid}-list" role="listbox" aria-label={m.map_search_label()}>
			{#each hits as hit, i (hit.id)}
				{#if i === 0 && places.length > 0}
					<li class="group map-lbl" role="presentation">{m.map_search_group_places()}</li>
				{/if}
				{#if i === places.length}
					<li class="group map-lbl" role="presentation">{m.map_search_group_people()}</li>
				{/if}
				<!-- mousedown (not click) so it fires before the input's blur closes the list. -->
				<li
					id="{uid}-{i}"
					class="hit"
					class:active={i === active}
					role="option"
					aria-selected={i === active}
					onmousedown={(e) => {
						e.preventDefault();
						choose(hit);
					}}
					onmouseenter={() => (active = i)}
				>
					<span class="primary">{hit.primary}</span>
					<span class="secondary">{hit.secondary}</span>
				</li>
			{/each}
			{#if hits.length === 0}
				<li class="empty" role="presentation">{m.map_search_no_results()}</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.search {
		position: relative;
		padding: 10px 20px;
		border-bottom: 1px solid var(--map-border-soft);
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		padding: 7px 10px;
		border: 1px solid var(--map-border-strong);
		border-radius: 6px;
		background: #fff;
		font: 400 13px var(--map-font-body);
		color: var(--map-ink);
	}
	.input:focus {
		outline: 2px solid var(--map-accent);
		outline-offset: -1px;
	}
	.list {
		position: absolute;
		left: 20px;
		right: 20px;
		top: calc(100% - 6px);
		z-index: 10;
		margin: 0;
		padding: 4px 0;
		list-style: none;
		max-height: 360px;
		overflow-y: auto;
		background: var(--map-bg-surface);
		border: 1px solid var(--map-border-strong);
		border-radius: 8px;
		box-shadow: var(--map-shadow-overlay);
	}
	.group {
		padding: 8px 12px 4px;
		color: var(--map-ink-muted);
	}
	.hit {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 6px 12px;
		cursor: pointer;
	}
	.hit.active {
		background: var(--map-bg-surface-sunken);
	}
	.primary {
		font-size: 13px;
		font-weight: 500;
		color: var(--map-ink);
	}
	.secondary {
		font-size: 11.5px;
		color: var(--map-ink-3);
	}
	.empty {
		padding: 8px 12px;
		font-size: 12px;
		color: var(--map-ink-muted);
	}
</style>
