// Live check of the html5 open-data parsing (src/lib/server/scraper/html5OpenData.ts) against a few
// real komm.one exports: bun run scripts/check-html5-opendata.ts [ags yyyymmdd]...
import {
	matchColumns,
	parseOpenDataFiles,
	parseResultRows,
	parseWahlen,
	parseWahlkreisPages
} from '../src/lib/server/scraper/html5OpenData';
import { parseOpenDataCsv } from '../src/lib/server/scraper/kreisOpenData';

const cases =
	process.argv.length > 2
		? process.argv
				.slice(2)
				.reduce<string[][]>((a, x, i, all) => (i % 2 ? a : [...a, [x, all[i + 1]]]), [])
		: [
				['08116019', '20210314'],
				['08111000', '20210314'],
				['08116019', '20160313']
			];

const get = async (u: string) => (await fetch(u)).text();
for (const [ags, d] of cases) {
	const base = `https://wahlergebnisse.komm.one/lb/produktion/wahltermin-${d}/${ags}/html5`;
	const wahlen = parseWahlen(await get(`${base}/index.html`));
	const files = parseOpenDataFiles(await get(`${base}/OpenDataInfo.html`));
	for (const w of wahlen) {
		const own = files.filter((f) => f.wahl === w.title);
		const st = own.find((f) => f.ebene === 'Wahlbezirk');
		if (!st) throw new Error(`${ags} ${d} ${w.title}: no Wahlbezirk csv`);
		const stations = parseOpenDataCsv(await get(`${base}/${st.url}`));
		const html = await get(`${base}/${w.resultPage}`);
		const wkFiles = own.filter((f) => /^Bezirke \(Wahlkreis: \d+\)$/.test(f.ebene));
		const groups: [ReturnType<typeof parseOpenDataCsv>, string][] = [];
		if (wkFiles.length > 1) {
			const pages = parseWahlkreisPages(html);
			const htmlOf = new Map<string, string>();
			for (let next; (next = [...pages].find(([nr]) => !htmlOf.has(nr)));) {
				const h = await get(`${base}/${next[1]}`);
				htmlOf.set(next[0], h);
				for (const [nr, page] of parseWahlkreisPages(h)) pages.set(nr, page);
			}
			for (const f of wkFiles) {
				const nr = /\d+/.exec(f.ebene)![0];
				const nrs = new Set(
					parseOpenDataCsv(await get(`${base}/${f.url}`)).map((r) => r['gebiet-nr'])
				);
				groups.push([stations.filter((s) => nrs.has(s['gebiet-nr'])), htmlOf.get(nr) ?? '']);
			}
		} else groups.push([stations, html]);
		for (const [g, page] of groups) {
			const rows = parseResultRows(page);
			const m = matchColumns(g, rows);
			if (!m) throw new Error(`${ags} ${d} ${w.title}: ${rows.length} rows vs columns mismatch`);
			console.log(
				`${ags} ${d} ${w.title} (id ${w.electionId}): ${g.length} Bezirke, ${rows.length} Listen, ${m.mismatches} Summenabweichungen, z.B. ${rows[0].label.split(', ').pop()} ${rows[0].color}`
			);
		}
	}
}
console.log('html5 ok');
