import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Relations covering the joins the map view and CSV export need (Phase 1/2). Not every FK in
 * schema.ts has a matching relation here yet — add more as later phases need them.
 *
 * Drizzle v1's `defineRelations` API: `from`/`to` reference columns via the `r` builder (not the
 * raw imported table objects from schema.ts), and accept either a single column or an array for
 * composite keys — confirmed against the installed drizzle-orm@1.0.0-rc.4 type definitions.
 */
export const relations = defineRelations(schema, (r) => ({
	cities: {
		elections: r.many.elections({ from: r.cities.rs, to: r.elections.rs }),
		pollingStations: r.many.pollingStations({ from: r.cities.rs, to: r.pollingStations.rs })
	},

	electionType: {
		elections: r.many.elections({ from: r.electionType.electionType, to: r.elections.electionType })
	},

	party: {
		electionPartyFamilies: r.many.electionPartyFamily({
			from: r.party.partyFamilyId,
			to: r.electionPartyFamily.partyFamilyId
		}),
		aggregateRegion: r.many.electionResultAggregatePartyRegion({
			from: r.party.partyFamilyId,
			to: r.electionResultAggregatePartyRegion.partyFamilyId
		}),
		aggregatePs: r.many.electionResultAggregatePartyPs({
			from: r.party.partyFamilyId,
			to: r.electionResultAggregatePartyPs.partyFamilyId
		}),
		aggregateDistrict: r.many.electionResultAggregatePartyDistrict({
			from: r.party.partyFamilyId,
			to: r.electionResultAggregatePartyDistrict.partyFamilyId
		})
	},

	elections: {
		city: r.one.cities({ from: r.elections.rs, to: r.cities.rs, optional: false }),
		type: r.one.electionType({
			from: r.elections.electionType,
			to: r.electionType.electionType,
			optional: true
		}),
		votetypes: r.many.electionsVotetypes({
			from: [r.elections.electionId, r.elections.rs],
			to: [r.electionsVotetypes.electionId, r.electionsVotetypes.rs]
		}),
		parties: r.many.electionParty({
			from: [r.elections.electionId, r.elections.rs],
			to: [r.electionParty.electionId, r.electionParty.rs]
		}),
		pollingStations: r.many.pollingStations({
			from: [r.elections.electionId, r.elections.rs],
			to: [r.pollingStations.electionId, r.pollingStations.rs]
		}),
		results: r.many.electionResult({
			from: [r.elections.electionId, r.elections.rs],
			to: [r.electionResult.electionId, r.electionResult.rs]
		})
	},

	electionsVotetypes: {
		election: r.one.elections({
			from: [r.electionsVotetypes.electionId, r.electionsVotetypes.rs],
			to: [r.elections.electionId, r.elections.rs],
			optional: false
		})
	},

	electionParty: {
		election: r.one.elections({
			from: [r.electionParty.electionId, r.electionParty.rs],
			to: [r.elections.electionId, r.elections.rs],
			optional: false
		}),
		partyFamilies: r.many.electionPartyFamily({
			from: [
				r.electionParty.partyId,
				r.electionParty.electionId,
				r.electionParty.votetypeId,
				r.electionParty.rs
			],
			to: [
				r.electionPartyFamily.partyId,
				r.electionPartyFamily.electionId,
				r.electionPartyFamily.votetypeId,
				r.electionPartyFamily.rs
			]
		})
	},

	electionPartyFamily: {
		election: r.one.elections({
			from: [r.electionPartyFamily.electionId, r.electionPartyFamily.rs],
			to: [r.elections.electionId, r.elections.rs],
			optional: false
		}),
		partyFamily: r.one.party({
			from: r.electionPartyFamily.partyFamilyId,
			to: r.party.partyFamilyId,
			optional: false
		}),
		electionParty: r.one.electionParty({
			from: [
				r.electionPartyFamily.partyId,
				r.electionPartyFamily.electionId,
				r.electionPartyFamily.votetypeId,
				r.electionPartyFamily.rs
			],
			to: [
				r.electionParty.partyId,
				r.electionParty.electionId,
				r.electionParty.votetypeId,
				r.electionParty.rs
			],
			optional: false
		})
	},

	pollingStations: {
		city: r.one.cities({ from: r.pollingStations.rs, to: r.cities.rs, optional: false }),
		election: r.one.elections({
			from: [r.pollingStations.electionId, r.pollingStations.rs],
			to: [r.elections.electionId, r.elections.rs],
			optional: false
		}),
		results: r.many.electionResult({
			from: [r.pollingStations.psId, r.pollingStations.electionId, r.pollingStations.rs],
			to: [r.electionResult.psId, r.electionResult.electionId, r.electionResult.rs]
		}),
		meta: r.many.electionResultPs({
			from: [r.pollingStations.psId, r.pollingStations.electionId, r.pollingStations.rs],
			to: [r.electionResultPs.psId, r.electionResultPs.electionId, r.electionResultPs.rs]
		})
	},

	electionResult: {
		city: r.one.cities({ from: r.electionResult.rs, to: r.cities.rs, optional: false }),
		election: r.one.elections({
			from: [r.electionResult.electionId, r.electionResult.rs],
			to: [r.elections.electionId, r.elections.rs],
			optional: false
		}),
		pollingStation: r.one.pollingStations({
			from: [r.electionResult.psId, r.electionResult.electionId, r.electionResult.rs],
			to: [r.pollingStations.psId, r.pollingStations.electionId, r.pollingStations.rs],
			optional: false
		})
	},

	electionResultPs: {
		city: r.one.cities({ from: r.electionResultPs.rs, to: r.cities.rs, optional: false }),
		pollingStation: r.one.pollingStations({
			from: [r.electionResultPs.psId, r.electionResultPs.electionId, r.electionResultPs.rs],
			to: [r.pollingStations.psId, r.pollingStations.electionId, r.pollingStations.rs],
			optional: false
		})
	},

	// rs on the region/meta-region tables can be a Kreis/Regierungsbezirk rollup value that has no
	// matching row in `cities` (only real Gemeinden are in `cities`) — city is genuinely optional here.
	electionResultAggregatePartyRegion: {
		partyFamily: r.one.party({
			from: r.electionResultAggregatePartyRegion.partyFamilyId,
			to: r.party.partyFamilyId,
			optional: false
		}),
		city: r.one.cities({
			from: r.electionResultAggregatePartyRegion.rs,
			to: r.cities.rs,
			optional: true
		})
	},
	electionResultAggregateMetaRegion: {
		city: r.one.cities({
			from: r.electionResultAggregateMetaRegion.rs,
			to: r.cities.rs,
			optional: true
		})
	},

	// Ps-grain aggregate tables are Stuttgart-only, so rs always resolves to a real city.
	electionResultAggregatePartyPs: {
		partyFamily: r.one.party({
			from: r.electionResultAggregatePartyPs.partyFamilyId,
			to: r.party.partyFamilyId,
			optional: false
		}),
		city: r.one.cities({
			from: r.electionResultAggregatePartyPs.rs,
			to: r.cities.rs,
			optional: false
		})
	},
	electionResultAggregateMetaPs: {
		city: r.one.cities({
			from: r.electionResultAggregateMetaPs.rs,
			to: r.cities.rs,
			optional: false
		})
	},

	electionResultAggregatePartyDistrict: {
		partyFamily: r.one.party({
			from: r.electionResultAggregatePartyDistrict.partyFamilyId,
			to: r.party.partyFamilyId,
			optional: false
		})
	}
}));
