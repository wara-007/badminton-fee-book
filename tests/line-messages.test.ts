import { describe, expect, it } from "vitest";
import {
  createAdminReviewPostbackData,
  createLinePostbackData,
  parseAdminReviewPostbackData,
  parseLinePostbackData,
} from "@/lib/line-messages";

describe("LINE interactive messages", () => {
  it("round-trips balance and payment postbacks", () => {
    const encoded = createLinePostbackData(
      "paid",
      "2026-07-23",
      "player-1",
      "kasikorn",
    );
    expect(parseLinePostbackData(encoded)).toEqual({
      action: "paid",
      sessionId: "2026-07-23",
      playerId: "player-1",
      accountId: "kasikorn",
    });
  });

  it("rejects unknown actions and malformed dates", () => {
    expect(parseLinePostbackData("a=delete&r=2026-07-23&p=1")).toBeNull();
    expect(parseLinePostbackData("a=paid&r=today&p=1")).toBeNull();
  });

  it("round-trips an admin approval decision", () => {
    const requestId = "2fa457a8-97cc-4ff7-9856-cc0e34397a21";
    expect(
      parseAdminReviewPostbackData(
        createAdminReviewPostbackData("approve", requestId),
      ),
    ).toEqual({ decision: "approve", requestId });
    expect(
      parseAdminReviewPostbackData(`a=admin_review&d=delete&q=${requestId}`),
    ).toBeNull();
  });
});
