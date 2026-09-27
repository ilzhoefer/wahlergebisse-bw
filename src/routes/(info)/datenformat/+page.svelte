<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { EXPORT_FILES } from '$lib/csv-export/files';

	type FileKey = keyof typeof EXPORT_FILES;
	type Column = (typeof EXPORT_FILES)[FileKey]['columns'][number];

	// Typed over every exported column, so a column added to EXPORT_FILES fails the type check here
	// until it is documented.
	const COLUMN_TEXT: Record<Column, () => string> = {
		rs: m.datenformat_col_rs,
		cityName: m.datenformat_col_city_name,
		votetypeId: m.datenformat_col_votetype_id,
		votesEligible: m.datenformat_col_votes_eligible,
		voters: m.datenformat_col_voters,
		invalidBallots: m.datenformat_col_invalid_ballots,
		validBallots: m.datenformat_col_valid_ballots,
		votesCast: m.datenformat_col_votes_cast,
		turnout: m.datenformat_col_turnout,
		partyNameShort: m.datenformat_col_party_name_short,
		partyNameLong: m.datenformat_col_party_name_long,
		voteCount: m.datenformat_col_vote_count,
		// The Gemeinde rollup stores shares (0–1); the per-station source values are percent (0–100).
		votePercent: m.datenformat_col_vote_percent_share,
		psId: m.datenformat_col_ps_id,
		stationName: m.datenformat_col_station_name,
		name: m.datenformat_col_station_name,
		partyName: m.datenformat_col_party_name,
		candidateName: m.datenformat_col_candidate_name,
		address: m.datenformat_col_address,
		description: m.datenformat_col_description,
		isPostal: m.datenformat_col_is_postal
	};
	const OVERRIDES: Partial<Record<FileKey, Partial<Record<Column, () => string>>>> = {
		psByCandidate: { votePercent: m.datenformat_col_vote_percent_pct }
	};

	const FILES: { key: FileKey; label: () => string; text: () => string }[] = [
		{ key: 'meta', label: m.daten_meta_label, text: m.datenformat_file_meta },
		{ key: 'aggregate', label: m.daten_aggregate_label, text: m.datenformat_file_aggregate },
		{ key: 'psByParty', label: m.daten_ps_label, text: m.datenformat_file_ps_party },
		{
			key: 'psByCandidate',
			label: m.datenformat_ps_candidate_heading,
			text: m.datenformat_file_ps_candidate
		},
		{ key: 'metaPs', label: m.daten_meta_ps_label, text: m.datenformat_file_meta_ps }
	];
</script>

<svelte:head><title>{m.datenformat_title()}</title></svelte:head>

<h1>{m.datenformat_title()}</h1>
<p>{m.datenformat_intro()}</p>

<h3>{m.datenformat_keys_title()}</h3>
<p>{m.datenformat_keys()}</p>

{#each FILES as f (f.key)}
	{@const file = EXPORT_FILES[f.key]}
	<h2 id={f.key}>{f.label()}</h2>
	<p class="file-name">{file.name}</p>
	<p>{f.text()}</p>
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>{m.datenformat_column()}</th>
					<th>{m.datenformat_meaning()}</th>
				</tr>
			</thead>
			<tbody>
				{#each file.columns as col (col)}
					<tr>
						<td class="col">{col}</td>
						<td>{(OVERRIDES[f.key]?.[col] ?? COLUMN_TEXT[col])()}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/each}

<style>
	.file-name {
		margin: -4px 0 8px;
		font: 400 12px var(--map-font-mono);
		color: var(--map-ink-muted);
	}
	.table-wrap {
		overflow-x: auto;
		margin: 0 0 12px;
		border: 1px solid var(--map-border-soft);
		border-radius: 6px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 7px 10px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--map-border-faint);
	}
	tr:last-child td {
		border-bottom: none;
	}
	th {
		background: var(--map-bg-list-a);
		font: 500 9.5px var(--map-font-mono);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--map-ink-muted);
	}
	td {
		font-size: 13px;
		line-height: 1.5;
		color: var(--map-ink-2);
	}
	.col {
		white-space: nowrap;
		font: 500 12px/1.6 var(--map-font-mono);
		color: var(--map-ink);
	}
</style>
