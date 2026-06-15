import { describe, expect, it } from "vitest";
import { createInitialSession } from "@/lib/session";
import { getRemoteSessionNotification } from "@/lib/remote-notification";

describe("remote session notifications", () => {
  it("reports a payment made by another device", () => {
    const current = createInitialSession();
    current.players = [{ id: "a", name: "A", shuttleCount: 0, skillLevel: "n", paid: false, gameCount: 0 }];
    const remote = structuredClone(current);
    remote.players[0] = { ...remote.players[0], paid: true, paidAmount: 120 };

    expect(getRemoteSessionNotification(current, remote)).toBe("A จ่ายแล้ว 120 บาท จากอีกเครื่อง");
  });

  it("reports a confirmed match from another device", () => {
    const current = createInitialSession();
    const remote = { ...current, currentShuttleNumber: 2 };

    expect(getRemoteSessionNotification(current, remote)).toBe("ยืนยัน Match ลูก 1 จากอีกเครื่อง");
  });

  it("reports every player in a batch payment", () => {
    const current = createInitialSession();
    current.players = [
      { id: "a", name: "A", shuttleCount: 0, skillLevel: "n", paid: false, gameCount: 0 },
      { id: "b", name: "B", shuttleCount: 0, skillLevel: "n", paid: false, gameCount: 0 }
    ];
    const remote = structuredClone(current);
    remote.players = remote.players.map((player, index) => ({
      ...player,
      paid: true,
      paidAmount: index === 0 ? 100 : 120
    }));

    expect(getRemoteSessionNotification(current, remote)).toBe(
      "จ่ายแล้ว 2 คน: A 100 บาท, B 120 บาท จากอีกเครื่อง"
    );
  });
});
