const REMOTE_REFRESH_RETRY_DELAYS_MS = [3000, 6000, 12000] as const;

export function getRemoteRefreshRetryDelay(attempt: number): number | null {
  return REMOTE_REFRESH_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export function hasUnsyncedLocalChanges(options: {
  currentSnapshot: string;
  lastRemoteSnapshot: string;
  hasPendingSnapshot: boolean;
  hasScheduledSave: boolean;
}): boolean {
  return (
    options.hasPendingSnapshot ||
    options.hasScheduledSave ||
    options.currentSnapshot !== options.lastRemoteSnapshot
  );
}
