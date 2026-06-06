import { describe, expect, it } from "vitest";
import { RemoteSaveConflictError, parseRemoteSaveResult } from "@/lib/supabase-session";

describe("Supabase session revision saves", () => {
  it("returns the saved revision and canonical server state", () => {
    const result = parseRemoteSaveResult({
      saved: true,
      revision: 8,
      state: {
        players: [],
        pricing: { baseFee: 90, shuttleFee: 26 },
        currentShuttleNumber: 1,
        plannedMatches: [],
        activityLog: [],
        updatedAt: "2026-06-05T18:00:00.000Z"
      },
      updated_at: "2026-06-05T18:00:01.000Z"
    });

    expect(result.revision).toBe(8);
    expect(result.session.updatedAt).toBe("2026-06-05T18:00:01.000Z");
  });

  it("throws a conflict containing the latest remote revision and state", () => {
    expect(() =>
      parseRemoteSaveResult({
        saved: false,
        revision: 9,
        state: {
          players: [],
          pricing: { baseFee: 90, shuttleFee: 26 },
          currentShuttleNumber: 55,
          plannedMatches: [],
          activityLog: [],
          updatedAt: "2026-06-05T18:05:00.000Z"
        },
        updated_at: "2026-06-05T18:05:01.000Z"
      })
    ).toThrow(RemoteSaveConflictError);
  });
});
