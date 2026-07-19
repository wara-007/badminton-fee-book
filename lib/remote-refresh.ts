import type { SessionState } from '@/lib/session';

const REMOTE_REFRESH_RETRY_DELAYS_MS = [3000, 6000, 12000] as const;

export function getComparableSessionSnapshot(snapshot: string): string {
  try {
    const session = JSON.parse(snapshot) as Record<string, unknown>;
    delete session.updatedAt;
    delete session.activityLog;
    return JSON.stringify(session);
  } catch {
    return snapshot;
  }
}

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
    getComparableSessionSnapshot(options.currentSnapshot) !==
      getComparableSessionSnapshot(options.lastRemoteSnapshot)
  );
}

export function canAutoSaveRemote(options: {
  hasSupabaseConfig: boolean;
  remoteBaselineReady: boolean;
  currentSnapshot: string;
  lastRemoteSnapshot: string;
}): boolean {
  if (!options.hasSupabaseConfig) return true;
  if (options.currentSnapshot === options.lastRemoteSnapshot) return false;
  return options.remoteBaselineReady;
}

export function mergeRemotePayments(
  local: SessionState,
  remote: SessionState,
): SessionState {
  const remotePlayers = new Map(remote.players.map((player) => [player.id, player]));
  return {
    ...local,
    players: local.players.map((player) => {
      const remotePlayer = remotePlayers.get(player.id);
      return remotePlayer
        ? {
            ...player,
            paid: remotePlayer.paid,
            paidAt: remotePlayer.paidAt,
            paidAmount: remotePlayer.paidAmount,
            paidAccountId: remotePlayer.paidAccountId,
          }
        : player;
    }),
  };
}

export function mergeRemoteMatchChanges(
  local: SessionState,
  remote: SessionState,
): SessionState {
  const localPlayers = new Map(local.players.map((player) => [player.id, player]));
  return {
    ...remote,
    players: remote.players.map((player) => {
      const localPlayer = localPlayers.get(player.id);
      return localPlayer
        ? {
            ...player,
            paid: localPlayer.paid,
            paidAt: localPlayer.paidAt,
            paidAmount: localPlayer.paidAmount,
            paidAccountId: localPlayer.paidAccountId,
          }
        : player;
    }),
    pricing: local.pricing,
  };
}

export function classifyRemoteChanges(local: SessionState, remote: SessionState): {
  hasPayments: boolean;
  hasMatchChanges: boolean;
  hasOtherChanges: boolean;
} {
  const localPlayers = new Map(local.players.map((player) => [player.id, player]));
  let hasPayments = false;
  let hasMatchChanges = local.currentShuttleNumber !== remote.currentShuttleNumber ||
    JSON.stringify(local.plannedMatches) !== JSON.stringify(remote.plannedMatches) ||
    JSON.stringify(local.matchSources ?? {}) !== JSON.stringify(remote.matchSources ?? {});
  let hasOtherChanges = local.players.length !== remote.players.length ||
    JSON.stringify(local.pricing) !== JSON.stringify(remote.pricing);

  for (const remotePlayer of remote.players) {
    const localPlayer = localPlayers.get(remotePlayer.id);
    if (!localPlayer) {
      hasOtherChanges = true;
      continue;
    }
    hasPayments ||= localPlayer.paid !== remotePlayer.paid ||
      localPlayer.paidAt !== remotePlayer.paidAt ||
      localPlayer.paidAmount !== remotePlayer.paidAmount ||
      localPlayer.paidAccountId !== remotePlayer.paidAccountId;
    hasMatchChanges ||= JSON.stringify(localPlayer.shuttleMarks ?? []) !== JSON.stringify(remotePlayer.shuttleMarks ?? []) ||
      localPlayer.gameCount !== remotePlayer.gameCount ||
      localPlayer.waitingSince !== remotePlayer.waitingSince ||
      localPlayer.restUntil !== remotePlayer.restUntil;
    hasOtherChanges ||= localPlayer.name !== remotePlayer.name ||
      localPlayer.skillLevel !== remotePlayer.skillLevel;
  }
  return { hasPayments, hasMatchChanges, hasOtherChanges };
}

export function mergeRemoteScopedChanges(local: SessionState, remote: SessionState): SessionState {
  const changes = classifyRemoteChanges(local, remote);
  let merged = local;
  if (changes.hasMatchChanges) merged = mergeRemoteMatchChanges(merged, remote);
  if (changes.hasPayments) merged = mergeRemotePayments(merged, remote);
  return merged;
}

export function mergeRemoteChangesAgainstBase(
  base: SessionState,
  local: SessionState,
  remote: SessionState,
): SessionState | null {
  const localChanges = classifyRemoteChanges(base, local);
  const remoteChanges = classifyRemoteChanges(base, remote);
  if (remoteChanges.hasOtherChanges || localChanges.hasOtherChanges) return null;
  if (localChanges.hasPayments && remoteChanges.hasPayments) return null;
  if (localChanges.hasMatchChanges && remoteChanges.hasMatchChanges) return null;

  let merged = local;
  if (remoteChanges.hasMatchChanges) merged = mergeRemoteMatchChanges(merged, remote);
  if (remoteChanges.hasPayments) merged = mergeRemotePayments(merged, remote);
  return merged;
}
