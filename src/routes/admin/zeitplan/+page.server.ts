import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crawlRun, crawlSchedule, electionType } from '$lib/server/db/schema';
import { getSchedule, nextScheduledRun } from '$lib/server/scheduler';
import { fromBerlinLocal } from '$lib/berlinTime';
import type { Actions, PageServerLoad } from './$types';

/** Guarded in hooks.server.ts; the actions' own `locals.isAdmin` checks are defence in depth. */
export const load: PageServerLoad = async () => {
	const [schedule, types, next] = await Promise.all([
		getSchedule(),
		db.select().from(electionType).orderBy(electionType.electionType),
		nextScheduledRun()
	]);
	const runs = schedule
		? await db
				.select({
					id: crawlRun.id,
					status: crawlRun.status,
					startedAt: crawlRun.startedAt,
					finishedAt: crawlRun.finishedAt
				})
				.from(crawlRun)
				.where(
					and(eq(crawlRun.electionType, schedule.electionType), eq(crawlRun.date, schedule.date))
				)
				.orderBy(desc(crawlRun.id))
				.limit(10)
		: [];
	return { schedule, electionTypes: types, next, runs };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.isAdmin) return fail(401);
		const form = await request.formData();
		const type = Number(form.get('electionType'));
		const date = String(form.get('date') ?? '');
		const interval = Number(form.get('intervalMinutes'));
		const startsAt = fromBerlinLocal(String(form.get('startsAt') ?? ''));
		const endsAt = fromBerlinLocal(String(form.get('endsAt') ?? ''));
		if (
			!Number.isInteger(type) ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!Number.isInteger(interval) ||
			interval < 5 ||
			interval > 24 * 60 ||
			!startsAt ||
			!endsAt ||
			endsAt <= startsAt
		)
			return fail(400, { error: 'invalid' as const });
		const values = {
			electionType: type,
			date,
			intervalMinutes: interval,
			startsAt,
			endsAt,
			active: form.get('active') === 'on'
		};
		await db
			.insert(crawlSchedule)
			.values({ id: 1, ...values })
			.onConflictDoUpdate({ target: crawlSchedule.id, set: values });
		return { saved: true };
	},
	stop: async ({ locals }) => {
		if (!locals.isAdmin) return fail(401);
		await db.update(crawlSchedule).set({ active: false }).where(eq(crawlSchedule.id, 1));
		return { saved: true };
	}
};
