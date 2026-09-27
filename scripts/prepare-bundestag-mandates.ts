/**
 * One-off per Bundestagswahl: who represents each Baden-Württemberg Wahlkreis, from the Bundeswahlleiterin's
 * official open data, written to a small per-date JSON file the map reads directly
 * (`src/lib/server/map/mandates/<date>.json`, mirroring `scraper/vote-districts/*.json`).
 *
 * Per Wahlkreis:
 * - `direct`: the Erststimme winner — `seat: true` with the direct mandate, or `seat: false` when the
 *   winner got no seat for lack of Zweitstimmendeckung (possible since the 2023 electoral reform;
 *   kerg2.csv's "Gewählt" column is "–" then).
 * - `list`: candidates of this Wahlkreis who entered the Bundestag via their party's Landesliste.
 *
 * Sources (Datenlizenz Deutschland – Namensnennung 2.0, © Die Bundeswahlleiterin):
 * - `.../ergebnisse/opendata/btw<yy>/csv/kerg2.csv`: winners' parties + Erststimme shares, "Gewählt".
 * - `btw<yy>_gewaehlte_utf8.zip` (linked from `.../<year>/gewaehlte.html`): every elected MP.
 * Names of winners *without* a seat aren't in either file; they come from our own komm.one candidate
 * rows (`election_party`, Erststimme, "Firstname Lastname, Partei"), so this needs DATABASE_URL and a
 * crawled election.
 *
 * Run with: bun run scripts/prepare-bundestag-mandates.ts 2025-02-23
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const date = process.argv[2];
if (!date) throw new Error('usage: prepare-bundestag-mandates.ts <date, e.g. 2025-02-23>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const year = date.slice(0, 4);
const SITE = `https://www.bundeswahlleiterin.de/bundestagswahlen/${year}`;
const LAND = 'BW';
const LAND_NR = '08';

const get = async (url: string) => {
	const res = await fetch(url, { headers: { 'user-agent': 'wahlergebnisse-bw' } });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res;
};

/** Semicolon CSV with a licence preamble: records start at the line beginning with "Wahlart;". */
function parseCsv(text: string): Record<string, string>[] {
	const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
	const start = lines.findIndex((l) => l.startsWith('Wahlart;'));
	const head = lines[start].split(';');
	return lines
		.slice(start + 1)
		.filter((l) => l.trim())
		.map((l) => {
			const cells = l.split(';');
			return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
		});
}

const csvFromZip = (zip: Buffer) => fileFromZip(zip, /\.csv$/);

/** The first file in a ZIP whose name matches, via its central directory (no unzip dependency). */
function fileFromZip(zip: Buffer, namePattern: RegExp): string {
	const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	let p = zip.readUInt32LE(eocd + 16);
	for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
		const method = zip.readUInt16LE(p + 10);
		const size = zip.readUInt32LE(p + 20);
		const nameLen = zip.readUInt16LE(p + 28);
		const next = p + 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
		const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
		if (namePattern.test(name) && !name.startsWith('__MACOSX')) {
			const local = zip.readUInt32LE(p + 42);
			const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
			const raw = zip.subarray(data, data + size);
			return (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
		}
		p = next;
	}
	throw new Error(`no ${namePattern} in ZIP`);
}

const num = (s: string) => (s ? Number(s.replace(',', '.')) : null);
const person = (r: Record<string, string>) =>
	[r.Titel, r.Vornamen.split(' ')[0], r.Namenszusatz, r.Nachname].filter(Boolean).join(' ');

/** First link on `pageUrl` whose href matches `pattern`, as an absolute URL. */
async function linkOn(pageUrl: string, pattern: RegExp): Promise<string | null> {
	const href = new RegExp(`href="([^"]*${pattern.source})"`).exec(
		await (await get(pageUrl)).text()
	);
	return href ? new URL(href[1], pageUrl).href : null;
}

// --- Wahlkreis winners (kerg2.csv) -----------------------------------------------------------------
// 2025 has an open-data folder; for 2021 the (final, "w-") kerg2 is linked from the results page.
const kerg2Url = (await fetch(`${SITE}/ergebnisse/opendata/btw${year.slice(2)}/csv/kerg2.csv`)).ok
	? `${SITE}/ergebnisse/opendata/btw${year.slice(2)}/csv/kerg2.csv`
	: await linkOn(`${SITE}/ergebnisse.html`, /kerg2\.csv/);
if (!kerg2Url) throw new Error('kerg2.csv not found');
const kerg2 = parseCsv(await (await get(kerg2Url)).text()).filter(
	(r) => r.Gebietsart === 'Wahlkreis' && r.UegGebietsnummer === LAND_NR
);

interface Winner {
	name: string | null;
	party: string;
	percent: number | null;
	seat: boolean;
}
const winners = new Map<string, Winner>();
const winnerVotes = new Map<string, number>();
for (const r of kerg2) {
	if (r.Stimme !== '1' || r.Gruppenart === 'System-Gruppe' || !r.Anzahl) continue;
	const wk = String(Number(r.Gebietsnummer));
	if (Number(r.Anzahl) <= (winnerVotes.get(wk) ?? -1)) continue;
	winnerVotes.set(wk, Number(r.Anzahl));
	winners.set(wk, {
		name: null,
		party: r.Gruppenname,
		percent: num(r.Prozent),
		// 2021's kerg2 has no "Gewählt" column — before the 2023 reform every winner got the seat.
		seat: r['Gewählt'] !== '–'
	});
}

// --- Elected MPs ---------------------------------------------------------------------------------------
interface Elected {
	kind: 'direct' | 'list';
	/** Wahlkreis won (direct) or also contested (list); null for list-only candidates. */
	wk: string | null;
	name: string;
	lastName: string;
	/** null = not in the source (MdB-Stammdaten): resolved from our candidate rows below. */
	party: string | null;
	listPlace: number | null;
}
const zipUrl = await linkOn(`${SITE}/gewaehlte.html`, /btw\d\d_gewaehlte_utf8\.zip/);
const elected: Elected[] = zipUrl ? await fromGewaehlteCsv(zipUrl) : await fromMdbStammdaten();

/** The Bundeswahlleiterin's list of elected candidates (published from 2025 on). */
async function fromGewaehlteCsv(url: string): Promise<Elected[]> {
	const rows = parseCsv(csvFromZip(Buffer.from(await (await get(url)).arrayBuffer())));
	return rows
		.filter((r) => r.GebietLandAbk === LAND)
		.map((r) => {
			const direct = r.Kennzeichen === 'Kreiswahlvorschlag';
			const wk = direct
				? r.Gebietsnummer
				: r.VerknGebietsart === 'Wahlkreis'
					? r.VerknGebietsnummer
					: '';
			return {
				kind: direct ? 'direct' : 'list',
				wk: wk ? String(Number(wk)) : null,
				name: person(r),
				lastName: r.Nachname,
				party: r.Gruppenname,
				listPlace: num(r.Listenplatz)
			};
		});
}

/**
 * Fallback for older elections (no elected-candidates file): the Bundestag's MdB master data
 * (https://www.bundestag.de/services/opendata, "Stammdaten aller Abgeordneten"). Members who
 * joined on the Wahlperiode's first day are the ones elected at the election (later dates are
 * successors). It has no list places and only today's party, so parties come from our candidates.
 */
async function fromMdbStammdaten(): Promise<Elected[]> {
	const WAHLPERIODE: Record<string, string> = { '2021': '20' };
	const wp = WAHLPERIODE[year];
	if (!wp) throw new Error(`no elected-candidates source for ${year}`);
	const zip = Buffer.from(
		await (
			await get('https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip')
		).arrayBuffer()
	);
	const xml = fileFromZip(zip, /MDB_STAMMDATEN\.XML$/);
	const tag = (s: string, t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(s)?.[1] ?? '';
	const periods = [...xml.matchAll(/<MDB>[\s\S]*?<\/MDB>/g)].flatMap(([mdb]) => {
		const name = [
			tag(mdb, 'AKAD_TITEL'),
			tag(mdb, 'VORNAME'),
			tag(mdb, 'PRAEFIX'),
			tag(mdb, 'NACHNAME')
		]
			.filter(Boolean)
			.join(' ');
		return [...mdb.matchAll(/<WAHLPERIODE>[\s\S]*?<\/WAHLPERIODE>/g)].map(([p]) => ({
			p,
			name,
			lastName: tag(mdb, 'NACHNAME')
		}));
	});
	const inWp = periods.filter(({ p }) => tag(p, 'WP') === wp);
	const firstDay = inWp
		.map(({ p }) => tag(p, 'MDBWP_VON'))
		.sort((a, b) => toIso(a).localeCompare(toIso(b)))[0];
	return inWp
		.filter(({ p }) => tag(p, 'MDBWP_VON') === firstDay)
		.filter(
			({ p }) =>
				(tag(p, 'MANDATSART') === 'Direktwahl' ? tag(p, 'WKR_LAND') : tag(p, 'LISTE')) === LAND
		)
		.map(({ p, name, lastName }) => ({
			kind: tag(p, 'MANDATSART') === 'Direktwahl' ? 'direct' : 'list',
			wk:
				tag(p, 'WKR_LAND') === LAND && tag(p, 'WKR_NUMMER')
					? String(Number(tag(p, 'WKR_NUMMER')))
					: null,
			name,
			lastName,
			party: null,
			listPlace: null
		}));
}

function toIso(d: string) {
	const [dd, mm, yyyy] = d.split('.');
	return `${yyyy}-${mm}-${dd}`;
}

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

/** A candidate's party from our komm.one Erststimme rows ("Lastname, Partei") in their Wahlkreis. */
/**
 * Where a list MP actually ran for the Erststimme, and for which party, from our komm.one candidate
 * labels ("Dr. Toncar, FDP" — so the surname is matched as the last word before the comma). Needed
 * for MdB-Stammdaten, whose Wahlkreis for list MPs can be their Betreuungswahlkreis rather than a
 * candidacy. Several candidates sharing the surname → the one in `hintWk`; none → list-only MP.
 */
async function candidacyOf(
	lastName: string,
	hintWk: string
): Promise<{ wk: string; party: string } | null> {
	const pattern = `(^|[ .-])${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `;
	const rows = await sql<{ wk: number; party: string }[]>`
		SELECT DISTINCT m.district_id AS wk, regexp_replace(ep.name, '^.*, ', '') AS party
		FROM election_party ep
		JOIN elections e ON e.election_id = ep.election_id AND e.rs = ep.rs
		JOIN election_vote_district_mapping m ON m.rs = ep.rs AND m.election_type = 2 AND m.date = e.date
		WHERE e.election_type = 2 AND e.date = ${date} AND ep.votetype_id = 0 AND ep.name ~ ${pattern}`;
	const pick = rows.length === 1 ? rows[0] : rows.find((r) => String(r.wk) === hintWk);
	return pick ? { wk: String(pick.wk), party: pick.party } : null;
}

interface ListMember {
	name: string;
	party: string;
	listPlace: number | null;
}
const list = new Map<string, ListMember[]>();
for (const e of elected) {
	if (!e.wk) continue;
	if (e.kind === 'direct') {
		const w = winners.get(e.wk);
		if (w) w.name = e.name;
		continue;
	}
	// The gewaehlte CSV states party and candidacy Wahlkreis; for MdB-Stammdaten derive both.
	const where = e.party ? { wk: e.wk, party: e.party } : await candidacyOf(e.lastName, e.wk);
	if (!where) {
		console.log(`${e.name}: nur über die Liste angetreten, keinem Wahlkreis zugeordnet`);
		continue;
	}
	list.set(where.wk, [
		...(list.get(where.wk) ?? []),
		{ name: e.name, party: where.party, listPlace: e.listPlace }
	]);
}

// --- Names of winners without a seat: our own komm.one Erststimme candidates -------------------------
for (const [wk, w] of winners) {
	if (w.name) continue;
	const rows = await sql<{ name: string }[]>`
		SELECT DISTINCT split_part(ep.name_long, ', ', 1) AS name
		FROM election_party ep
		JOIN elections e ON e.election_id = ep.election_id AND e.rs = ep.rs
		JOIN election_vote_district_mapping m ON m.rs = ep.rs AND m.election_type = 2 AND m.date = e.date
		WHERE e.election_type = 2 AND e.date = ${date} AND ep.votetype_id = 0
			AND m.district_id = ${Number(wk)} AND ep.name LIKE '%, %'
			AND lower(regexp_replace(ep.name, '^.*, ', '')) = lower(${w.party})`;
	if (rows.length === 1) w.name = rows[0].name;
	else console.warn(`WK ${wk}: ${rows.length} Kandidat:innen für ${w.party} gefunden — Name offen`);
}
await sql.end();

const out: Record<string, { direct: Winner | null; list: ListMember[] }> = {};
for (const wk of [...new Set([...winners.keys(), ...list.keys()])].sort((a, b) => +a - +b)) {
	const w = winners.get(wk);
	out[wk] = {
		direct: w ? { name: w.name, party: w.party, percent: w.percent, seat: w.seat } : null,
		list: (list.get(wk) ?? []).sort((a, b) => (a.listPlace ?? 99) - (b.listPlace ?? 99))
	};
}
const dir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../src/lib/server/map/mandates'
);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(out, null, '\t') + '\n');
const noSeat = Object.entries(out).filter(([, v]) => v.direct && !v.direct.seat);
console.log(
	`${Object.keys(out).length} Wahlkreise, ${noSeat.length} Sieger:innen ohne Mandat (${noSeat.map(([wk, v]) => `${wk} ${v.direct!.name}`).join(', ')}), ${[...list.values()].flat().length} Listen-MdB`
);
