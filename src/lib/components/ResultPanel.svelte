<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	export interface DetailParty {
		partyFamilyId: number;
		nameShort: string | null;
		color: string | null;
		votePercent: number | null;
		voteCount: number | null;
	}

	export interface DetailSeatGroup {
		partyFamilyId: number | null;
		nameShort: string | null;
		color: string | null;
		seatCount: number;
		candidateNames: string[];
	}

	export interface RegionDetailData {
		turnoutPercent: number | null;
		parties: DetailParty[];
		seats: { total: number; groups: DetailSeatGroup[] } | null;
	}

	interface Props {
		open: boolean;
		loading: boolean;
		regionName: string;
		/** Translated map-mode label (Kreis/Gemeinde/…) shown as a small eyebrow above the region name. */
		modeLabel: string;
		detail: RegionDetailData | null;
		onClose: () => void;
	}

	let { open, loading, regionName, modeLabel, detail, onClose }: Props = $props();

	function seatsFor(partyFamilyId: number): number | null {
		return detail?.seats?.groups.find((g) => g.partyFamilyId === partyFamilyId)?.seatCount ?? null;
	}

	const independentSeats = $derived(
		detail?.seats?.groups.find((g) => g.partyFamilyId === null) ?? null
	);
</script>

{#if open}
	<aside
		class="absolute top-16 right-4 bottom-8 z-20 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-white/95 p-4 shadow-lg sm:w-96"
	>
		<button
			class="absolute top-3 right-3 text-lg leading-none text-gray-400 hover:text-gray-700"
			aria-label={m.map_panel_close()}
			onclick={onClose}
		>
			×
		</button>

		<div class="pr-6 text-xs tracking-wide text-gray-500 uppercase">{modeLabel}</div>
		<h2 class="mb-2 pr-6 text-lg font-semibold">{regionName}</h2>

		{#if loading}
			<p class="text-sm text-gray-500">{m.map_panel_loading()}</p>
		{:else if detail && (detail.parties.length > 0 || detail.seats)}
			{#if detail.turnoutPercent !== null}
				<p class="mb-3 text-sm text-gray-600">
					{m.map_popup_wahlbeteiligung({ value: detail.turnoutPercent.toFixed(1) })}
				</p>
			{/if}

			{#if detail.seats}
				<div class="mb-1 flex h-5 w-full overflow-hidden rounded bg-gray-100">
					{#each detail.seats.groups as g (g.partyFamilyId ?? 'independent')}
						<div
							style={`width:${(g.seatCount / detail.seats.total) * 100}%; background:${g.color ?? '#9AA0A6'}`}
							title={`${g.nameShort ?? m.map_panel_unabhaengig()}: ${g.seatCount}`}
						></div>
					{/each}
				</div>
				<div class="mb-4 flex justify-between text-xs text-gray-500">
					<span>{m.map_panel_sitzverteilung()}</span>
					<span>{m.map_panel_sitze_total({ count: detail.seats.total })}</span>
				</div>
			{/if}

			<table class="w-full text-sm">
				<thead>
					<tr class="border-b text-left text-xs text-gray-500 uppercase">
						<th class="pb-1 font-medium">{m.map_partei_label()}</th>
						<th class="pb-1 text-right font-medium">{m.map_panel_stimmen()}</th>
						{#if detail.seats}
							<th class="pb-1 text-right font-medium">{m.map_panel_sitze()}</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each detail.parties as p (p.partyFamilyId)}
						<tr class="border-b last:border-0">
							<td class="py-1.5">
								<span
									class="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
									style={`background:${p.color ?? '#9AA0A6'}`}
								></span>{p.nameShort ?? m.map_panel_unbekannt()}
							</td>
							<td class="py-1.5 text-right tabular-nums">
								{p.votePercent !== null ? `${p.votePercent.toFixed(1)}%` : '–'}
							</td>
							{#if detail.seats}
								<td class="py-1.5 text-right tabular-nums">{seatsFor(p.partyFamilyId) ?? '–'}</td>
							{/if}
						</tr>
					{/each}
					{#if independentSeats}
						<tr class="border-b text-gray-500 last:border-0">
							<td class="py-1.5">{m.map_panel_unabhaengig()}</td>
							<td class="py-1.5 text-right">–</td>
							<td class="py-1.5 text-right tabular-nums">{independentSeats.seatCount}</td>
						</tr>
					{/if}
				</tbody>
			</table>
		{:else}
			<p class="text-sm text-gray-500">{m.map_popup_keine_daten()}</p>
		{/if}
	</aside>
{/if}
