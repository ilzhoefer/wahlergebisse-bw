import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';
import { getCurrentState, subscribeToDateDiscovery } from '$lib/server/date-discovery';

export const GET: RequestHandler = ({ locals, request }) => {
	requireAdmin(locals);

	const encoder = new TextEncoder();
	let keepAlive: ReturnType<typeof setInterval>;
	let unsubscribe: () => void;

	const stream = new ReadableStream({
		start(controller) {
			const send = (state: ReturnType<typeof getCurrentState>) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
			};
			send(getCurrentState());
			unsubscribe = subscribeToDateDiscovery(send);
			keepAlive = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15000);

			request.signal.addEventListener('abort', () => {
				clearInterval(keepAlive);
				unsubscribe();
				controller.close();
			});
		},
		cancel() {
			clearInterval(keepAlive);
			unsubscribe?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
