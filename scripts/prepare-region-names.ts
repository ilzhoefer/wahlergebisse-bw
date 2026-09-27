/**
 * Name index for the server (link previews, Gemeinde pages), which can't afford to load the geo
 * files: Regierungsbezirk/Kreis names by rs, Wahlkreis names by ref. Derived from src/lib/geo/ —
 * re-run after scripts/prepare-geo-data.ts: bun run scripts/prepare-region-names.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GEO = path.resolve(__dirname, '../src/lib/geo');
const OUT = path.resolve(__dirname, '../src/lib/server/map/region-names.json');

function names(file: string, key: string): Record<string, string> {
	const geo = JSON.parse(readFileSync(path.join(GEO, file), 'utf-8'));
	return Object.fromEntries(
		geo.features.map((f: { properties: Record<string, unknown> }) => [
			String(f.properties[key]),
			String(f.properties.name)
		])
	);
}

const out = {
	regions: { ...names('regierungsbezirk.json', 'rs'), ...names('kreis.json', 'rs') },
	wahlkreisBundestag: names('wahlkreis-bundestag.json', 'ref'),
	wahlkreisLandtag: names('wahlkreis-landtag.json', 'ref')
};
writeFileSync(OUT, JSON.stringify(out, null, '\t') + '\n');
console.log(
	`wrote ${Object.keys(out.regions).length} regions, ${Object.keys(out.wahlkreisBundestag).length} + ${Object.keys(out.wahlkreisLandtag).length} Wahlkreise`
);
