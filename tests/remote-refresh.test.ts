import { describe, expect, it } from "vitest";
import { getRemoteRefreshRetryDelay, hasUnsyncedLocalChanges } from "@/lib/remote-refresh";

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
});
