/**
 * Parliament-arc ("Sitzverteilung") layout: `total` seats as dots on concentric semicircles of radius
 * INNER..1, each row holding seats in proportion to its radius (i.e. its arc length). Dots come back
 * sorted left→right by angle, so filling them party by party yields one wedge per party.
 */
export interface SeatDot {
	x: number;
	y: number;
}

const INNER = 0.4;

/** Seats per row, inner → outer; sums to `total`. */
export function seatRows(total: number): number[] {
	if (total <= 0) return [];
	const n = Math.max(1, Math.ceil(Math.sqrt(total / 4)));
	const radii = Array.from({ length: n }, (_, i) =>
		n === 1 ? 1 : INNER + (i * (1 - INNER)) / (n - 1)
	);
	const sum = radii.reduce((a, b) => a + b, 0);
	// Largest-remainder rounding, so rows always add up to exactly `total`.
	const exact = radii.map((r) => (total * r) / sum);
	const rows = exact.map(Math.floor);
	const byRemainder = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
	const missing = total - rows.reduce((a, b) => a + b, 0);
	for (let k = 0; k < missing; k++) rows[byRemainder[k][1]]++;
	return rows;
}

/** Dot centres in a (-1..1, -1..0) box (y up is negative, SVG-style) plus a dot radius that keeps
 * neighbours from touching. */
export function seatLayout(total: number): { dots: SeatDot[]; dotRadius: number } {
	const rows = seatRows(total);
	const n = rows.length;
	const gap = n > 1 ? (1 - INNER) / (n - 1) : 1;
	let minSpacing = gap;
	const placed: { angle: number; r: number; x: number; y: number }[] = [];
	rows.forEach((count, i) => {
		const r = n === 1 ? 1 : INNER + i * gap;
		if (count > 1) minSpacing = Math.min(minSpacing, (Math.PI * r) / (count - 1));
		for (let j = 0; j < count; j++) {
			const angle = count === 1 ? Math.PI / 2 : Math.PI * (1 - j / (count - 1));
			placed.push({ angle, r, x: r * Math.cos(angle), y: -r * Math.sin(angle) });
		}
	});
	placed.sort((a, b) => b.angle - a.angle || a.r - b.r);
	return {
		dots: placed.map(({ x, y }) => ({ x, y })),
		dotRadius: Math.min(0.4 * minSpacing, 0.12)
	};
}

/** Short party names in rough left→right order, for seating parties in the arc. Keyed by
 * `party.name_short`, the same party identity the map page uses everywhere (`selectedParty`).
 * ponytail: hand-kept list; a party missing here seats with FREIE WÄHLER (most unlisted local
 * lists are Wählervereinigungen). Add names when new parties win seats. */
export const SPECTRUM = [
	'DKP',
	'DIE LINKE',
	'Die PARTEI',
	'PIRATEN',
	'Volt',
	'KLIMALISTE',
	'SPD',
	'GRÜNE',
	'Tierschutzpartei',
	'Tierschutzalianz',
	'ÖDP',
	'Team Todenhöfer',
	'BIG',
	'ABG',
	'FDP',
	'FREIE WÄHLER',
	'CDU',
	'Bündnis C',
	'BP',
	'LKR',
	'dieBasis',
	'AfD',
	'NPD'
];

export function spectrumRank(name: string | null): number {
	const i = SPECTRUM.indexOf(name ?? '');
	return i === -1 ? SPECTRUM.indexOf('FREIE WÄHLER') : i;
}
