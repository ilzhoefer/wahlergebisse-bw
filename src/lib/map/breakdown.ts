/**
 * Pure helpers over `RegionBreakdown` rows for the Kartenansicht's panel and hover card: Land-wide
 * sums, bar rows and German number formatting. No component state — see src/routes/+page.svelte.
 */
import type { RegionBreakdown } from '#lib/server/map/queries.ts';
import * as m from '#lib/paraglide/messages.js';

/** Weighted sum of several regions' breakdowns into one combined total — used for the Land scope,
 * which has no row of its own in the aggregate tables (see getRegionBreakdowns' doc comment).
 * Vote shares are recomputed from summed raw vote counts (not averaged percentages) and turnout is
 * eligible-voter-weighted — both necessary since the four Regierungsbezirke differ hugely in size. */
export function sumBreakdowns(list: RegionBreakdown[]): RegionBreakdown {
	let eligibleSum = 0;
	let votersWeighted = 0;
	const partyTotals = new Map<string, { color: string | null; voteCount: number }>();
	for (const b of list) {
		if (b.eligible != null) {
			eligibleSum += b.eligible;
			if (b.turnout != null) votersWeighted += (b.turnout / 100) * b.eligible;
		}
		for (const r of b.rows) {
			if (!r.partyName) continue;
			const cur = partyTotals.get(r.partyName) ?? { color: r.color, voteCount: 0 };
			cur.voteCount += r.voteCount ?? 0;
			if (!cur.color) cur.color = r.color;
			partyTotals.set(r.partyName, cur);
		}
	}
	const totalVotes = Array.from(partyTotals.values()).reduce((s, p) => s + p.voteCount, 0);
	const rows = Array.from(partyTotals, ([partyName, p]) => ({
		partyName,
		color: p.color,
		voteCount: p.voteCount,
		votePercent: totalVotes > 0 ? (p.voteCount / totalVotes) * 100 : null,
		seats: null
	})).sort((a, b) => (b.votePercent ?? -Infinity) - (a.votePercent ?? -Infinity));
	return {
		key: 'LAND',
		turnout: eligibleSum > 0 ? (votersWeighted / eligibleSum) * 100 : null,
		eligible: eligibleSum || null,
		seatTotal: null, // no election in this app allocates seats state-wide
		rows
	};
}

/** Voters (turnout × eligible) — the absolute counterpart of a turnout share. */
export function votersOf(b: RegionBreakdown | null | undefined): number | null {
	return b?.turnout == null || b.eligible == null ? null : (b.turnout / 100) * b.eligible;
}

/** Signed vote-count difference, e.g. "+1.234". */
export function fmtVoteDiff(v: number | null | undefined): string {
	return v == null ? '–' : (v > 0 ? '+' : '') + fmtNum(v);
}

/** Strongest (rank 0) or second-strongest (rank 1) party of a breakdown — rows are sorted by share. */
export function rankedRow(b: RegionBreakdown | null | undefined, rank: number) {
	return b?.rows[rank]?.votePercent != null ? b.rows[rank] : undefined;
}

export function fmtDiff(v: number): string {
	return m.map_split_diff_pts({ diff: (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') });
}

export function fmtPct(v: number | null | undefined): string {
	return v == null ? '–' : v.toFixed(1).replace('.', ',') + ' %';
}

export function fmtNum(v: number | null | undefined): string {
	return v == null ? '–' : Math.round(v).toLocaleString('de-DE');
}

/** "CDU / Dr. Max Mustermann" — Erststimmen, where only one candidate of the party ran in the
 * area (the server sets `candidate` only then). */
export function withCandidate(r: RegionBreakdown['rows'][number]): string {
	if (!r.candidate) return r.partyName ?? '';
	// Bundestag/Landtag "Sonstige" holds only independents (every party has its own family), so a
	// single person there ran without a party.
	const party = r.partyName === 'Sonstige' ? m.map_independent_candidate() : r.partyName;
	return `${party ?? ''} / ${r.candidate}`;
}

/** `absolute`: vote counts instead of shares (left panel's "Stimmen" setting; the hover card keeps
 * shares). Bars stay share-based either way — same proportions within one area. */
/** Bar length in % of the track — true to scale, no minimum (a zero is an empty bar). */
export function barWidth(percent: number): number {
	return Math.max(0, Math.min(100, percent));
}

export function toRows(
	b: RegionBreakdown | null | undefined,
	limit: number | null,
	absolute = false
) {
	if (!b || b.rows.length === 0) return [];
	const max = Math.max(...b.rows.map((r) => r.votePercent ?? 0), 0.0001);
	const rows = limit === null ? b.rows : b.rows.slice(0, limit);
	return rows.map((r) => ({
		key: r.partyName ?? 'unknown',
		color: r.color,
		name: withCandidate(r),
		pct: absolute ? fmtNum(r.voteCount) : fmtPct(r.votePercent),
		seats: r.seats != null ? String(r.seats) : null,
		widthPercent: barWidth(((r.votePercent ?? 0) / max) * 100)
	}));
}

/** The one row for the party currently driving the Hochburg colouring — a top-5-by-share list isn't
 * the point in this mode, the selected party's own number here is. */
export function toSingleRow(b: RegionBreakdown, partyName: string, absolute = false) {
	const row = b.rows.find((r) => r.partyName === partyName);
	if (!row) return [];
	return [
		{
			key: row.partyName ?? 'unknown',
			color: row.color,
			name: withCandidate(row),
			pct: absolute ? fmtNum(row.voteCount) : fmtPct(row.votePercent),
			seats: row.seats != null ? String(row.seats) : null,
			widthPercent: barWidth(row.votePercent ?? 0)
		}
	];
}
