import type { VisualMode } from '$lib/map/shareUrl';
import * as m from '$lib/paraglide/messages';

// Internal values stay the German domain vocabulary used throughout the backend/API — only the
// displayed label is translated (see visualModeLabel below). "2. Stärkste Partei" is kept as a
// fourth option beyond the click-dummy's three (confirmed with the user — see the plan file).
// Order of the Toolbar's "Weitere" dropdown; the tab row picks its own subset by viewport width.
export const VISUAL_MODES: VisualMode[] = [
	'Stärkste Partei',
	'Wahlbeteiligung',
	'Hochburg',
	'Veränderung',
	'2. Stärkste Partei',
	'Stimmensplitting',
	'Punkte'
];

export function visualModeLabel(mode: VisualMode): string {
	switch (mode) {
		case 'Stärkste Partei':
			return m.map_info_staerkste_partei();
		case '2. Stärkste Partei':
			return m.map_info_zweite_staerkste_partei();
		case 'Wahlbeteiligung':
			return m.map_info_wahlbeteiligung();
		case 'Hochburg':
			return m.map_info_hochburg();
		case 'Stimmensplitting':
			return m.map_info_stimmensplitting();
		case 'Veränderung':
			return m.map_info_veraenderung();
		case 'Punkte':
			return m.map_info_punkte();
	}
}

export function visualModeHint(mode: VisualMode, available: boolean): string {
	switch (mode) {
		case 'Stärkste Partei':
			return m.map_mode_hint_staerkste();
		case '2. Stärkste Partei':
			return m.map_mode_hint_zweite();
		case 'Wahlbeteiligung':
			return m.map_mode_hint_wahlbeteiligung();
		case 'Hochburg':
			return m.map_mode_hint_hochburg();
		case 'Stimmensplitting':
			return available
				? m.map_mode_hint_stimmensplitting()
				: m.map_mode_hint_stimmensplitting_unavailable();
		case 'Veränderung':
			return available
				? m.map_mode_hint_veraenderung()
				: m.map_mode_hint_veraenderung_unavailable();
		case 'Punkte':
			return m.map_mode_hint_punkte();
	}
}
