<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Source {
		name: string;
		url: string;
		text: () => string;
		/** Credit notice as the provider prescribes it (kept verbatim, not translated). */
		credit?: string;
	}

	const statistikBw = 'Statistisches Landesamt Baden-Württemberg';
	const groups: { title: () => string; sources: Source[] }[] = [
		{
			title: m.about_sources_results,
			sources: [
				{
					name: 'Komm.ONE – votemanager',
					url: 'https://wahlergebnisse.komm.one',
					text: m.about_src_kommone
				},
				{
					name: statistikBw,
					url: 'https://wahlen.statistik-bw.de/ltw26/',
					text: m.about_src_statistik_ltw
				}
			]
		},
		{
			title: m.about_sources_mandates,
			sources: [
				{
					name: 'Die Bundeswahlleiterin',
					url: 'https://www.bundeswahlleiterin.de/bundestagswahlen/',
					text: m.about_src_bundeswahlleiterin,
					credit:
						'© Die Bundeswahlleiterin, Wiesbaden. Datenlizenz Deutschland – Namensnennung – Version 2.0'
				},
				{
					name: 'Deutscher Bundestag',
					url: 'https://www.bundestag.de/services/opendata',
					text: m.about_src_bundestag
				},
				{
					name: 'Landeszentrale für politische Bildung Baden-Württemberg',
					url: 'https://www.landtagswahl-bw.de/',
					text: m.about_src_lpb
				}
			]
		},
		{
			title: m.about_sources_geo,
			sources: [
				{
					name: 'OpenStreetMap',
					url: 'https://www.openstreetmap.org/copyright',
					text: m.about_src_osm,
					credit: '© OpenStreetMap-Mitwirkende, Open Database License (ODbL)'
				},
				{
					name: statistikBw,
					url: 'https://www.statistik-bw.de/service/karten-und-atlanten/wahlkreiskarten/',
					text: m.about_src_statistik_wk,
					credit:
						'© Statistisches Landesamt Baden-Württemberg, Stuttgart 2020. Kartengrundlage: LGL (www.lgl-bw.de), Stadt Freiburg, Stadt Karlsruhe, Stadt Mannheim, Landeshauptstadt Stuttgart'
				},
				{
					name: 'Landeshauptstadt Stuttgart, Statistisches Amt',
					url: 'https://www.stuttgart.de/service/wahlen/wahldaten/wahldaten',
					text: m.about_src_stuttgart,
					credit: '© Landeshauptstadt Stuttgart/Statistisches Amt'
				},
				{
					name: 'Komm.ONE – votemanager',
					url: 'https://wahlergebnisse.komm.one',
					text: m.about_src_kommone_geo
				}
			]
		},
		{
			title: m.about_sources_reference,
			sources: [
				{
					name: 'Statistische Ämter des Bundes und der Länder – Zensus 2022',
					url: 'https://www.zensus2022.de/',
					text: m.about_src_zensus
				},
				{
					name: 'Statistisches Bundesamt (Destatis)',
					url: 'https://www.destatis.de/',
					text: m.about_src_destatis
				}
			]
		}
	];
</script>

<svelte:head><title>{m.about_title()}</title></svelte:head>

<h1>{m.about_title()}</h1>
<p>{m.about_intro()}</p>
<p>{m.about_thesis()}</p>
<p>{m.about_dashboard()}</p>
<p class="note">{m.about_disclaimer()}</p>

<h2>{m.about_sources_title()}</h2>
{#each groups as group (group.title)}
	<h3>{group.title()}</h3>
	<div class="sources">
		{#each group.sources as source (source.url + source.text())}
			<div class="source">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external site -->
				<a class="source-name" href={source.url} rel="noopener" target="_blank">{source.name} ↗</a>
				<span class="source-text">{source.text()}</span>
				{#if source.credit}<span class="source-credit">{source.credit}</span>{/if}
			</div>
		{/each}
	</div>
{/each}
<p>{m.about_src_parties()}</p>

<style>
	.sources {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0 0 12px;
	}
	.source {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px 12px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
		background: var(--map-bg-list-b);
	}
	.source-name {
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}
	.source-text {
		font-size: 13px;
		line-height: 1.5;
		color: var(--map-ink-2);
	}
	.source-credit {
		font: 400 10.5px/1.5 var(--map-font-mono);
		color: var(--map-ink-muted);
	}
</style>
