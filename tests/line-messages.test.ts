import { describe, expect, it } from "vitest";
import {
  createAdminReviewPostbackData,
  createLinePostbackData,
  createSupportRequestMessage,
  createSupportPostbackData,
  parseAdminReviewPostbackData,
  parseLinePostbackData,
  parseSupportPostbackData,
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

  it("round-trips support postback data", () => {
    const threadId = "123e4567-e89b-12d3-a456-426614174000";
    expect(
      parseSupportPostbackData(createSupportPostbackData("reply", threadId)),
    ).toEqual({ action: "reply", threadId });
    expect(
      parseSupportPostbackData(`a=support&d=delete&q=${threadId}`),
    ).toBeNull();
  });

  it("builds a support card that opens the web ticket without reply mode", () => {
    const message = createSupportRequestMessage({
      threadId: "123e4567-e89b-12d3-a456-426614174000",
      requesterName: "สมชาย",
      message: "วันนี้รับมือใหม่ไหมครับ",
      ticketUrl:
        "https://badminton-fee-book.vercel.app/support?ticket=123e4567-e89b-12d3-a456-426614174000",
    });
    const serialized = JSON.stringify(message);
    expect(message.type).toBe("flex");
    expect(serialized).toContain("เปิด Ticket");
    expect(serialized).toContain('"type":"uri"');
    expect(serialized).toContain("/support?ticket=");
    expect(serialized).not.toContain("ตอบกลับ");
    expect(serialized).not.toContain('"d=reply"');
  });
});
