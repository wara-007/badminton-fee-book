import { describe, expect, it } from "vitest";
import {
  RemoteSaveConflictError,
  parseRemoteSaveResult,
  prepareSessionForRemote
} from "@/lib/supabase-session";

describe("Supabase session revision saves", () => {
  it("keeps match metadata but removes general activity history before remote saves", () => {
    const session = {
      players: [],
      pricing: { baseFee: 90, shuttleFee: 26 },
      currentShuttleNumber: 1,
      plannedMatches: [],
      activityLog: [
        { id: "1", action: "paid" as const, message: "A paid", createdAt: "2026-06-15T00:00:00.000Z" },
        { id: "2", action: "mark-added" as const, message: "A ลงลูก 1", createdAt: "2026-06-15T00:01:00.000Z" },
        { id: "3", action: "match-confirmed" as const, message: "ยืนยันลูก 2", createdAt: "2026-06-15T00:02:00.000Z" }
      ],
      updatedAt: "2026-06-15T00:03:00.000Z"
    };

    expect(prepareSessionForRemote(session).activityLog.map((activity) => activity.action)).toEqual([
      "mark-added",
      "match-confirmed"
    ]);
    expect(session.activityLog).toHaveLength(3);
  });

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
