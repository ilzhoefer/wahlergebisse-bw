import { interpolateBlues } from 'd3-scale-chromatic';

/** Port of shiny_colorscale_turnout: a Blues sequential scale over the turnout values present. */
export function turnoutColorScale(
	turnoutPercentValues: number[]
): (value: number) => string | undefined {
	const values = turnoutPercentValues.filter((v) => Number.isFinite(v));
	if (values.length === 0) return () => undefined;
	const min = Math.min(...values);
	const max = Math.max(...values);
	return (value: number) => {
		if (!Number.isFinite(value)) return undefined;
		const t = max === min ? 0.5 : (value - min) / (max - min);
		return interpolateBlues(t);
	};
}

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d) % 6;
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	h *= 60;
	if (h < 0) h += 360;
	return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r: number, g: number, b: number;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
	return (
		'#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
	);
}

/** HSL-lightness approximation of R colorspace::lighten/darken (amount in [0, 1]). */
function adjustLightness(hex: string, amount: number): string {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const newL = amount >= 0 ? l + (1 - l) * amount : l + l * amount;
	return rgbToHex(...hslToRgb(h, s, Math.max(0, Math.min(1, newL))));
}

/**
 * Port of shiny_colorscale_party: an interpolated scale from a lightened to a darkened version of
 * one party's brand color, over the vote-share values present. Used for the "Hochburg" map mode.
 */
export function partyColorScale(
	votePercentValues: number[],
	partyColorHex: string
): (value: number) => string | undefined {
	const values = votePercentValues.filter((v) => Number.isFinite(v));
	const light = adjustLightness(partyColorHex, 0.5);
	const dark = adjustLightness(partyColorHex, -0.5);
	if (values.length === 0) return () => undefined;
	const min = Math.min(...values);
	const max = Math.min(100, Math.max(...values));
	const [lr, lg, lb] = hexToRgb(light);
	const [dr, dg, db] = hexToRgb(dark);
	return (value: number) => {
		if (!Number.isFinite(value)) return undefined;
		const t = max === min ? 0.5 : (value - min) / (max - min);
		const clamped = Math.max(0, Math.min(1, t));
		return rgbToHex(
			Math.round(lr + (dr - lr) * clamped),
			Math.round(lg + (dg - lg) * clamped),
			Math.round(lb + (db - lb) * clamped)
		);
	};
}
