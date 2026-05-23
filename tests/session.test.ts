import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  DEFAULT_SHUTTLE_COLUMNS,
  calculatePlayerTotal,
  createPlayer,
  groupPaidPlayersByDay,
  getVisibleShuttleColumns,
  summarizeSession
} from "@/lib/session";

describe("badminton session calculations", () => {
  it("calculates each player from base fee plus shuttle count", () => {
    const player = createPlayer("A");
    const total = calculatePlayerTotal({ ...player, shuttleCount: 3 }, DEFAULT_PRICING);

    expect(total).toBe(175);
  });

  it("keeps at least the default shuttle columns and expands after the last used slot", () => {
    expect(getVisibleShuttleColumns([{ ...createPlayer("A"), shuttleCount: 0 }])).toBe(
      DEFAULT_SHUTTLE_COLUMNS
    );
    expect(getVisibleShuttleColumns([{ ...createPlayer("A"), shuttleCount: 10 }])).toBe(11);
  });

  it("summarizes totals, paid amount, and remaining amount", () => {
    const players = [
      { ...createPlayer("A"), shuttleCount: 2, paid: true, paidAt: "2026-05-24T02:00:00.000Z" },
      { ...createPlayer("B"), shuttleCount: 1, paid: false }
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toEqual({
      playerCount: 2,
      shuttleCount: 3,
      totalAmount: 275,
      paidAmount: 150,
      unpaidAmount: 125
    });
  });

  it("groups paid players by the day they paid", () => {
    const players = [
      { ...createPlayer("A"), shuttleCount: 2, paid: true, paidAt: "2026-05-24T02:00:00.000Z" },
      { ...createPlayer("B"), shuttleCount: 1, paid: true, paidAt: "2026-05-24T03:00:00.000Z" },
      { ...createPlayer("C"), shuttleCount: 4, paid: true, paidAt: "2026-05-25T02:00:00.000Z" },
      { ...createPlayer("D"), shuttleCount: 3, paid: false }
    ];

    expect(groupPaidPlayersByDay(players, DEFAULT_PRICING)).toEqual([
      {
        dateKey: "2026-05-25",
        totalAmount: 200,
        players: [{ name: "C", shuttleCount: 4, amount: 200 }]
      },
      {
        dateKey: "2026-05-24",
        totalAmount: 275,
        players: [
          { name: "A", shuttleCount: 2, amount: 150 },
          { name: "B", shuttleCount: 1, amount: 125 }
        ]
      }
    ]);
  });
});
