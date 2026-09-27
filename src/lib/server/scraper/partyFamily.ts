import { and, eq, ilike, like, or, sql } from 'drizzle-orm';
import type { db as DbType } from '$lib/server/db';
import { elections, electionParty, electionPartyFamily, party } from '$lib/server/db/schema';
import type { Logger } from './client';

type Db = typeof DbType;

/** Catch-all families (see party-families.csv) for ballot lines no real family matches: local voter
 * groups in local elections, everything else (tiny parties, independent candidates) otherwise. Never
 * matched by name — only assigned to what's left over. */
const WAEHLERVEREINIGUNGEN_FAMILY = 90;
const SONSTIGE_FAMILY = 91;
/** Regionalwahl, Kreistagswahl, Gemeinderatswahl — where unmatched lists are local voter groups. */
const LOCAL_ELECTION_TYPES = new Set([4, 5, 6]);
/** Extra long names a family also goes by (matched like its own long name). */
const LONG_NAME_ALIASES: Record<number, string[]> = {
	29: ['Klimaliste Baden-Württemberg'] // KLIMALISTE's BW branch ("KlimalisteBW")
};

/**
 * Port of `update_party_family`, extended. For every known party family, finds every
 * `election_party` row for this election whose `name`/`nameLong` contains the family's short/long
 * name and tags it with that family. Short names match case-sensitively (as in the R original —
 * short acronyms like "BIG" would otherwise hit local lists such as "BiG – Bürgerliste im Gäu"); long
 * names (and aliases) match case-insensitively, since ballots vary in casing ("Die Linke" vs. the
 * family's "DIE LINKE", "FREIE WÄHLERVEREINIGUNG" vs. "Freie Wähler"). Whatever still has no family
 * afterwards goes to a catch-all family instead of silently dropping out of every aggregate.
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

	const partyFamilies = (await db.select().from(party)).filter(
		(f) => f.partyFamilyId !== WAEHLERVEREINIGUNGEN_FAMILY && f.partyFamilyId !== SONSTIGE_FAMILY
	);

	for (const [i, family] of partyFamilies.entries()) {
		const familyLabel = family.nameShort ?? String(family.partyFamilyId);
		log(`[${i + 1}/${partyFamilies.length}] Parteifamilie "${familyLabel}" zuordnen`, {
			level: 'family',
			index: i + 1,
			total: partyFamilies.length,
			label: familyLabel
		});

		const longNames = [
			...(family.nameLong ? [family.nameLong] : []),
			...(LONG_NAME_ALIASES[family.partyFamilyId] ?? [])
		];
		const conditions = [
			...longNames.map((n) => ilike(electionParty.nameLong, `%${escapeLike(n)}%`)),
			...(family.nameShort ? [like(electionParty.name, `%${escapeLike(family.nameShort)}%`)] : [])
		];
		if (conditions.length === 0) continue;
		const matchCondition = or(...conditions);

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

	const catchAll = LOCAL_ELECTION_TYPES.has(electionTypeId)
		? WAEHLERVEREINIGUNGEN_FAMILY
		: SONSTIGE_FAMILY;
	log(`Nicht zugeordnete Listen → Parteifamilie ${catchAll}`);
	await db.execute(sql`
		INSERT INTO ${electionPartyFamily} (party_family_id, rs, election_id, party_id, ps_id, votetype_id)
		SELECT DISTINCT ${catchAll}::int, ep.rs, ep.election_id, ep.party_id, ep.ps_id, ep.votetype_id
		FROM ${electionParty} ep
		JOIN ${elections} e ON e.election_id = ep.election_id AND e.rs = ep.rs
		WHERE e.election_type = ${electionTypeId} AND e.date = ${date}
			AND NOT EXISTS (
				SELECT 1 FROM ${electionPartyFamily} f
				WHERE f.rs = ep.rs AND f.election_id = ep.election_id
					AND f.party_id = ep.party_id AND f.votetype_id = ep.votetype_id
			)
		ON CONFLICT DO NOTHING
	`);
}

/** Family names are data, not patterns: a literal % or _ in one must not act as a LIKE wildcard. */
function escapeLike(s: string): string {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
