/**
 * Shared mutual-exclusion flag between the crawl runner and the date-discovery runner — both hit the
 * same external API and the same DB, so only one background admin task should run at a time per
 * server instance. Deliberately not per-task-kind so neither module needs to import the other.
 */
let running = false;

export function isAnyTaskRunning(): boolean {
	return running;
}

export function acquireTaskLock(): boolean {
	if (running) return false;
	running = true;
	return true;
}

export function releaseTaskLock(): void {
	running = false;
}
