import { describe, expect, it } from "vitest";
import { createInitialSession } from "@/lib/session";
import { canAutoSaveRemote, classifyRemoteChanges, getComparableSessionSnapshot, getRemoteRefreshRetryDelay, hasUnsyncedLocalChanges, mergeRemoteChangesAgainstBase, mergeRemoteMatchChanges, mergeRemotePayments, mergeRemoteScopedChanges } from "@/lib/remote-refresh";

describe("remote refresh retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(getRemoteRefreshRetryDelay(1)).toBe(3000);
    expect(getRemoteRefreshRetryDelay(2)).toBe(6000);
    expect(getRemoteRefreshRetryDelay(3)).toBe(12000);
    expect(getRemoteRefreshRetryDelay(4)).toBeNull();
  });

  it("detects pending, scheduled, and unsaved local changes", () => {
    expect(hasUnsyncedLocalChanges({
      currentSnapshot: "local",
      lastRemoteSnapshot: "remote",
      hasPendingSnapshot: false,
      hasScheduledSave: false
    })).toBe(true);
    expect(hasUnsyncedLocalChanges({
      currentSnapshot: "same",
      lastRemoteSnapshot: "same",
      hasPendingSnapshot: true,
      hasScheduledSave: false
    })).toBe(true);
    expect(hasUnsyncedLocalChanges({
      currentSnapshot: "same",
      lastRemoteSnapshot: "same",
      hasPendingSnapshot: false,
      hasScheduledSave: false
    })).toBe(false);
  });

  it("ignores timestamps and activity metadata when comparing sessions", () => {
    expect(getComparableSessionSnapshot(JSON.stringify({ players: [], updatedAt: "a", activityLog: [1] })))
      .toBe(getComparableSessionSnapshot(JSON.stringify({ players: [], updatedAt: "b", activityLog: [] })));
  });

  it("blocks remote auto-save until a remote baseline has loaded", () => {
    expect(canAutoSaveRemote({
      hasSupabaseConfig: true,
      remoteBaselineReady: false,
      currentSnapshot: "local",
      lastRemoteSnapshot: ""
    })).toBe(false);
    expect(canAutoSaveRemote({
      hasSupabaseConfig: true,
      remoteBaselineReady: true,
      currentSnapshot: "local",
      lastRemoteSnapshot: "remote"
    })).toBe(true);
    expect(canAutoSaveRemote({
      hasSupabaseConfig: false,
      remoteBaselineReady: false,
      currentSnapshot: "local",
      lastRemoteSnapshot: ""
    })).toBe(true);
  });

  it("merges remote payment without replacing local match changes", () => {
    const local = createInitialSession();
    local.currentShuttleNumber = 3;
    local.players = [{ id: "a", name: "A", shuttleCount: 1, shuttleMarks: [2], skillLevel: "n", paid: false, gameCount: 1 }];
    const remote = structuredClone(local);
    remote.currentShuttleNumber = 2;
    remote.players[0] = { ...remote.players[0], paid: true, paidAmount: 120, paidAccountId: "kasikorn" };

    const merged = mergeRemotePayments(local, remote);

    expect(merged.currentShuttleNumber).toBe(3);
    expect(merged.players[0]).toMatchObject({ shuttleMarks: [2], paid: true, paidAmount: 120, paidAccountId: "kasikorn" });
  });

  it("merges remote match changes without replacing local payments", () => {
    const local = createInitialSession();
    local.players = [{ id: "a", name: "A", shuttleCount: 0, shuttleMarks: [], skillLevel: "n", paid: true, paidAmount: 120, paidAccountId: "kasikorn", gameCount: 0 }];
    const remote = structuredClone(local);
    remote.currentShuttleNumber = 2;
    remote.players[0] = { ...remote.players[0], shuttleCount: 1, shuttleMarks: [1], paid: false, paidAmount: undefined, gameCount: 1 };

    const merged = mergeRemoteMatchChanges(local, remote);

    expect(merged.currentShuttleNumber).toBe(2);
    expect(merged.players[0]).toMatchObject({ shuttleMarks: [1], gameCount: 1, paid: true, paidAmount: 120, paidAccountId: "kasikorn" });
  });

  it("merges payment and match changes received in the same remote update", () => {
    const local = createInitialSession();
    local.players = [{ id: "a", name: "A", shuttleCount: 0, shuttleMarks: [], skillLevel: "n", paid: false, gameCount: 0 }];
    const remote = structuredClone(local);
    remote.currentShuttleNumber = 2;
    remote.players[0] = {
      ...remote.players[0],
      shuttleCount: 1,
      shuttleMarks: [1],
      gameCount: 1,
      paid: true,
      paidAmount: 120,
      paidAccountId: "kasikorn"
    };

    expect(classifyRemoteChanges(local, remote)).toEqual({
      hasPayments: true,
      hasMatchChanges: true,
      hasOtherChanges: false
    });
    expect(mergeRemoteScopedChanges(local, remote)).toMatchObject({
      currentShuttleNumber: 2,
      players: [{ shuttleMarks: [1], gameCount: 1, paid: true, paidAmount: 120, paidAccountId: "kasikorn" }]
    });
  });

  it("keeps an unsynced local match when remote only changes payment", () => {
    const base = createInitialSession();
    base.players = [{ id: "a", name: "A", shuttleCount: 0, shuttleMarks: [], skillLevel: "n", paid: false, gameCount: 0 }];
    const local = structuredClone(base);
    local.currentShuttleNumber = 2;
    local.players[0] = { ...local.players[0], shuttleCount: 1, shuttleMarks: [1], gameCount: 1 };
    const remote = structuredClone(base);
    remote.players[0] = { ...remote.players[0], paid: true, paidAmount: 120, paidAccountId: "kasikorn" };

    expect(mergeRemoteChangesAgainstBase(base, local, remote)).toMatchObject({
      currentShuttleNumber: 2,
      players: [{ shuttleMarks: [1], gameCount: 1, paid: true, paidAmount: 120, paidAccountId: "kasikorn" }]
    });
  });

  it("refuses to merge when both devices change the match", () => {
    const base = createInitialSession();
    const local = structuredClone(base);
    local.currentShuttleNumber = 2;
    const remote = structuredClone(base);
    remote.currentShuttleNumber = 3;

    expect(mergeRemoteChangesAgainstBase(base, local, remote)).toBeNull();
  });
});
