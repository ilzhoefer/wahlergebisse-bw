/** "08.03.2026" for an ISO date, always with two-digit day and month. */
export const formatDate = (iso: string) =>
	new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
