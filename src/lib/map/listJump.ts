/**
 * Listenspringer in BW's Gemeinderatswahl: seats go to lists, then within a list to the candidates
 * with the most votes (Kumulieren/Panaschieren) — not by ballot order. A list with `seats` seats
 * "would" have elected its first `seats` candidates; anyone elected from further down jumped past
 * someone above them, who was pushed out.
 */
export type ListOutcome = 'jumped' | 'pushedOut' | null;

export function listOutcome(position: number, elected: boolean, listSeats: number): ListOutcome {
	if (elected && position > listSeats) return 'jumped';
	if (!elected && position <= listSeats) return 'pushedOut';
	return null;
}
