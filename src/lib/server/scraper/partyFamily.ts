import { and, eq, like, or, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionParty, electionPartyFamily, party } from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/**
 * Port of `update_party_family`. For every known party family, finds every `election_party` row for
 * this election whose `name`/`nameLong` contains the family's short/long name and tags it with that
 * family. A party whose ballot label doesn't match any family's pattern is simply left unclassified
 * (its `election_party_family` row is never written) — same as the R original.
 */
export async function updatePartyFamily(
	db: Db,
	date: string,
	electionTypeId: number,
	override: boolean,
	log: Logger
) {
	if (override) {
		await db.execute(sql`
			DELETE FROM ${electionPartyFamily}
			WHERE (rs, election_id) IN (
				SELECT rs, election_id FROM ${elections}
				WHERE election_type = ${electionTypeId} AND date = ${date}
			)
		`);
	}

	const partyFamilies = await db.select().from(party);

	for (const [i, family] of partyFamilies.entries()) {
		const familyLabel = family.nameShort ?? String(family.partyFamilyId);
		log(`[${i + 1}/${partyFamilies.length}] Parteifamilie "${familyLabel}" zuordnen`, {
			level: 'family',
			index: i + 1,
			total: partyFamilies.length,
			label: familyLabel
		});

		const nameMatch = family.nameLong
			? like(electionParty.nameLong, `%${family.nameLong}%`)
			: undefined;
		const shortMatch = family.nameShort
			? like(electionParty.name, `%${family.nameShort}%`)
			: undefined;
		const matchCondition =
			nameMatch && shortMatch ? or(nameMatch, shortMatch) : (nameMatch ?? shortMatch);
		if (!matchCondition) continue;

		const rows = await db
			.selectDistinct({
				rs: electionParty.rs,
				electionId: electionParty.electionId,
				partyId: electionParty.partyId,
				psId: electionParty.psId,
				votetypeId: electionParty.votetypeId
			})
			.from(electionParty)
			.innerJoin(
				elections,
				and(eq(elections.electionId, electionParty.electionId), eq(elections.rs, electionParty.rs))
			)
			.where(
				and(eq(elections.electionType, electionTypeId), eq(elections.date, date), matchCondition)
			);

		for (const row of rows) {
			await db
				.insert(electionPartyFamily)
				.values({ partyFamilyId: family.partyFamilyId, ...row })
				.onConflictDoNothing();
		}
	}
}
