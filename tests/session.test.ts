import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  DEFAULT_SHUTTLE_COLUMNS,
  calculatePlayersTotal,
  calculatePlayerTotal,
  createPlayer,
  getBillableShuttleCount,
  getShuttleMarkSummary,
  groupPaidPlayersByDay,
  groupMatchesByShuttle,
  getVisibleShuttleColumns,
  getVisibleShuttleColumnsForCurrent,
  summarizeSession
} from "@/lib/session";

describe("badminton session calculations", () => {
  it("calculates each player from base fee plus checked marks", () => {
    const player = createPlayer("A");
    const total = calculatePlayerTotal({ ...player, shuttleCount: 3 }, DEFAULT_PRICING);

    expect(total).toBe(175);
  });

  it("calculates a group total with four checked marks as one shuttle", () => {
    const players = [
      { ...createPlayer("A"), shuttleMarks: [1] },
      { ...createPlayer("B"), shuttleMarks: [1] },
      { ...createPlayer("C"), shuttleMarks: [1] },
      { ...createPlayer("D"), shuttleMarks: [1] },
      { ...createPlayer("E"), shuttleMarks: [2] }
    ];

    expect(getBillableShuttleCount(players)).toBe(2);
    expect(calculatePlayersTotal(players, DEFAULT_PRICING)).toBe(550);
  });

  it("calculates each player from the number of checked shuttle marks", () => {
    const player = createPlayer("A");
    const total = calculatePlayerTotal(
      { ...player, shuttleCount: 2, shuttleMarks: [1, 1] },
      DEFAULT_PRICING
    );

    expect(total).toBe(150);
  });

  it("keeps at least the default shuttle columns and expands after the last used slot", () => {
    expect(getVisibleShuttleColumns([{ ...createPlayer("A"), shuttleCount: 0 }])).toBe(
      DEFAULT_SHUTTLE_COLUMNS
    );
    expect(getVisibleShuttleColumns([{ ...createPlayer("A"), shuttleCount: 10 }])).toBe(11);
  });

  it("does not expand visible columns from the current shuttle number alone", () => {
    expect(getVisibleShuttleColumnsForCurrent([], 24)).toBe(DEFAULT_SHUTTLE_COLUMNS);
  });

  it("summarizes marks by shuttle number and keeps duplicate names", () => {
    const players = [
      { ...createPlayer("A"), shuttleMarks: [7] },
      { ...createPlayer("B"), shuttleMarks: [7, 7] },
      { ...createPlayer("C"), shuttleMarks: [7] },
      { ...createPlayer("D"), shuttleMarks: [24] }
    ];

    expect(getShuttleMarkSummary(players, 7)).toEqual({
      shuttleNumber: 7,
      count: 4,
      names: ["A", "B", "B", "C"],
      isComplete: true,
      missingCount: 0
    });
    expect(getShuttleMarkSummary(players, 24)).toEqual({
      shuttleNumber: 24,
      count: 1,
      names: ["D"],
      isComplete: false,
      missingCount: 3
    });
  });

  it("summarizes unpaid total, paid amount, and remaining amount", () => {
    const players = [
      { ...createPlayer("A"), shuttleCount: 2, paid: true, paidAt: "2026-05-24T02:00:00.000Z" },
      { ...createPlayer("B"), shuttleCount: 1, paid: false }
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toEqual({
      playerCount: 2,
      shuttleCount: 1,
      totalAmount: 100,
      paidAmount: 125,
      unpaidAmount: 100
    });
  });

  it("keeps paid players' shuttle marks in the remaining session calculation", () => {
    const players = [
      { ...createPlayer("A"), shuttleMarks: [1], paid: true, paidAt: "2026-05-24T02:00:00.000Z" },
      { ...createPlayer("B"), shuttleMarks: [1], paid: false },
      { ...createPlayer("C"), shuttleMarks: [1], paid: false },
      { ...createPlayer("D"), shuttleMarks: [1], paid: false }
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toEqual({
      playerCount: 4,
      shuttleCount: 1,
      totalAmount: 300,
      paidAmount: 125,
      unpaidAmount: 300
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
        totalAmount: 125,
        players: [{ name: "C", shuttleCount: 4, amount: 200 }]
      },
      {
        dateKey: "2026-05-24",
        totalAmount: 225,
        players: [
          { name: "A", shuttleCount: 2, amount: 150 },
          { name: "B", shuttleCount: 1, amount: 125 }
        ]
      }
    ]);
  });

  it("groups matches by shuttle number and keeps duplicate marks", () => {
    const players = [
      { ...createPlayer("a"), shuttleMarks: [1, 2, 3] },
      { ...createPlayer("b"), shuttleMarks: [1, 3, 3] },
      { ...createPlayer("c"), shuttleMarks: [1, 2, 3] },
      { ...createPlayer("d"), shuttleMarks: [1] },
      { ...createPlayer("e"), shuttleMarks: [2] },
      { ...createPlayer("f"), shuttleMarks: [2] }
    ];

    expect(groupMatchesByShuttle(players)).toEqual([
      { shuttleNumber: 1, playerNames: ["a", "b", "c", "d"] },
      { shuttleNumber: 2, playerNames: ["a", "c", "e", "f"] },
      { shuttleNumber: 3, playerNames: ["a", "b", "b", "c"] }
    ]);
  });
});
