import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  findLinePlayerMatches,
  getBangkokDateKey,
  getLineGroupIds,
  getLinePublicMenuReply,
  isLineAdmin,
  isSetAdminGroupCommand,
  isUnsetAdminGroupCommand,
  parseLineBalanceCommand,
  verifyLineWebhookSignature,
} from "@/lib/line-webhook";

describe("LINE webhook", () => {
  it("verifies the exact raw request body", () => {
    const body = JSON.stringify({ destination: "Ubot", events: [] });
    const secret = "test-channel-secret";
    const signature = createHmac("sha256", secret).update(body).digest("base64");

    expect(verifyLineWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyLineWebhookSignature(`${body}\n`, signature, secret)).toBe(false);
    expect(verifyLineWebhookSignature(body, null, secret)).toBe(false);
  });

  it("extracts unique group IDs and ignores user sources", () => {
    expect(getLineGroupIds([
      { type: "join", source: { type: "group", groupId: "Cgroup-one" } },
      { type: "message", source: { type: "group", groupId: "Cgroup-one" } },
      { type: "message", source: { type: "group", groupId: "Cgroup-two" } },
      { type: "message", source: { type: "user" } },
    ])).toEqual(["Cgroup-one", "Cgroup-two"]);
  });

  it("uses today's Bangkok room when a balance command has no date", () => {
    expect(parseLineBalanceCommand(
      "ยอด สมชาย",
      "2026-07-22T18:30:00.000Z",
    )).toEqual({
      playerQuery: "สมชาย",
      sessionId: "2026-07-23",
    });
    expect(getBangkokDateKey("2026-07-22T18:30:00.000Z")).toBe("2026-07-23");
  });

  it("uses an explicitly requested room date", () => {
    expect(parseLineBalanceCommand("ยอด น้องสมชาย 2026-07-21")).toEqual({
      playerQuery: "น้องสมชาย",
      sessionId: "2026-07-21",
    });
  });

  it("finds a partial name but prefers an exact match", () => {
    const players = [
      { id: "1", name: "น้องสมชาย" },
      { id: "2", name: "พี่สมชาย" },
      { id: "3", name: "สมชาย" },
    ];
    expect(findLinePlayerMatches(players, "ชาย")).toHaveLength(3);
    expect(findLinePlayerMatches(players, "สมชาย")).toEqual([players[2]]);
  });

  it("allows configured admins and supports the legacy direct recipient fallback", () => {
    expect(isLineAdmin("Utwo", "Uone, Utwo", undefined)).toBe(true);
    expect(isLineAdmin("Ulegacy", undefined, "Ulegacy")).toBe(true);
    expect(isLineAdmin("Uother", "Uone", "Uother")).toBe(false);
  });

  it("recognizes only the exact admin-group registration command", () => {
    expect(isSetAdminGroupCommand("ตั้งกลุ่มแอดมิน")).toBe(true);
    expect(isSetAdminGroupCommand("  ตั้งกลุ่มแอดมิน  ")).toBe(true);
    expect(isSetAdminGroupCommand("ตั้งกลุ่มประกาศ")).toBe(false);
  });

  it("recognizes only the exact admin-group removal command", () => {
    expect(isUnsetAdminGroupCommand("ยกเลิกกลุ่มแอดมิน")).toBe(true);
    expect(isUnsetAdminGroupCommand("  ยกเลิกกลุ่มแอดมิน  ")).toBe(true);
    expect(isUnsetAdminGroupCommand("ยกเลิกกลุ่มประกาศ")).toBe(false);
  });

  it("returns the public Rich Menu information", () => {
    expect(getLinePublicMenuReply("ตารางเล่น")).toContain(
      "อังคารและศุกร์ 20:00–00:30 น.",
    );
    expect(getLinePublicMenuReply("ตารางเล่น")).toContain(
      "ลูก RSL No.1 ลูกละ 26 บาท",
    );
    expect(getLinePublicMenuReply("ติดต่อ")).toBe(
      "ติดต่อ\nโทร. 089-081-0878\nLINE ID: Gu_Pu2499",
    );
    expect(getLinePublicMenuReply("Map สนาม")).toBeNull();
  });
});
