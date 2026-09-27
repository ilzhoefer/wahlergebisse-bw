/**
 * The CSV files the Daten-Export endpoint produces — file name and column order. Shared with the
 * export page, which shows the names on its data-type cards and the columns in its preview.
 */
export const EXPORT_FILES = {
	meta: {
		name: 'wahlbeteiligung.csv',
		columns: [
			'rs',
			'cityName',
			'votetypeId',
			'votesEligible',
			'voters',
			'invalidBallots',
			'validBallots',
			'votesCast',
			'turnout'
		]
	},
	aggregate: {
		name: 'parteiergebnisse_pro_gemeinde.csv',
		columns: [
			'rs',
			'cityName',
			'partyNameShort',
			'partyNameLong',
			'votetypeId',
			'voteCount',
			'votePercent'
		]
	},
	psByCandidate: {
		name: 'ergebnisse_pro_wahlbezirk_kandidaten.csv',
		columns: [
			'rs',
			'cityName',
			'psId',
			'stationName',
			'votetypeId',
			'partyName',
			'candidateName',
			'voteCount',
			'votePercent'
		]
	},
	psByParty: {
		name: 'ergebnisse_pro_wahlbezirk_parteien.csv',
		columns: [
			'rs',
			'cityName',
			'psId',
			'stationName',
			'votetypeId',
			'partyNameShort',
			'partyNameLong',
			'voteCount'
		]
	},
	metaPs: {
		name: 'wahlbezirke_metadaten.csv',
		columns: ['rs', 'cityName', 'psId', 'name', 'address', 'description', 'isPostal']
	}
} as const;
