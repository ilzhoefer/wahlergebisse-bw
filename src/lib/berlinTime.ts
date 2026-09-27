/**
 * Wall-clock time in Germany ↔ instants, without a date library: admins type election-night times
 * as Berlin time (<input type="datetime-local">), while the server runs in UTC.
 */
const TZ = 'Europe/Berlin';

/** Berlin's UTC offset in minutes at `instant` (60 in winter, 120 in summer). */
function offsetMinutes(instant: Date): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: TZ,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		})
			.formatToParts(instant)
			.map((p) => [p.type, p.value])
	);
	const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
	return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** "2026-03-08T18:00" (Berlin) → Date, or null if malformed. */
export function fromBerlinLocal(local: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
	const guess = new Date(`${local}:00Z`);
	if (Number.isNaN(guess.getTime())) return null;
	// Two passes settle the offset even right at a DST switch.
	let result = new Date(guess.getTime() - offsetMinutes(guess) * 60000);
	result = new Date(guess.getTime() - offsetMinutes(result) * 60000);
	return result;
}

/** Date → "2026-03-08T18:00" in Berlin time, for a datetime-local input's value. */
export function toBerlinLocal(instant: Date): string {
	const shifted = new Date(instant.getTime() + offsetMinutes(instant) * 60000);
	return shifted.toISOString().slice(0, 16);
}

/** Date → "08.03.2026, 18:00" in Berlin time. */
export function formatBerlin(instant: Date): string {
	return instant.toLocaleString('de-DE', {
		timeZone: TZ,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
