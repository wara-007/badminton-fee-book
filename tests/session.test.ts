import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING,
  DEFAULT_SHUTTLE_COLUMNS,
  appendActivity,
  calculatePlayersTotal,
  calculatePlayerTotal,
  createActivity,
  createInitialSession,
  createPlayer,
  exportSessionSummary,
  findMatchOverlapWarning,
  getBillableShuttleCount,
  getPriorityPlayers,
  getPlayerWaitStatus,
  getShuttleMarkSummary,
  groupPaidPlayersByDay,
  groupMatchesByShuttle,
  getVisibleShuttleColumns,
  getVisibleShuttleColumnsForCurrent,
  summarizeSession,
} from '@/lib/session';

describe('badminton session calculations', () => {
  it('calculates each player from base fee plus checked marks', () => {
    const player = createPlayer('A');
    const total = calculatePlayerTotal(
      { ...player, shuttleCount: 3 },
      DEFAULT_PRICING,
    );

    expect(total).toBe(175);
  });

  it('calculates a group total with four checked marks as one shuttle', () => {
    const players = [
      { ...createPlayer('A'), shuttleMarks: [1] },
      { ...createPlayer('B'), shuttleMarks: [1] },
      { ...createPlayer('C'), shuttleMarks: [1] },
      { ...createPlayer('D'), shuttleMarks: [1] },
      { ...createPlayer('E'), shuttleMarks: [2] },
    ];

    expect(getBillableShuttleCount(players)).toBe(2);
    expect(calculatePlayersTotal(players, DEFAULT_PRICING)).toBe(550);
  });

  it('calculates waiting status after signup and after rest time ends', () => {
    const player = {
      ...createPlayer('A'),
      waitingSince: '2026-05-25T10:00:00.000Z',
    };

    expect(getPlayerWaitStatus(player, '2026-05-25T10:14:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(player, '2026-05-25T10:15:00.000Z')).toBe(
      'warning',
    );
    expect(getPlayerWaitStatus(player, '2026-05-25T10:20:00.000Z')).toBe(
      'danger',
    );

    const restedPlayer = {
      ...player,
      restUntil: '2026-05-25T10:20:00.000Z',
    };

    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:19:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:34:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:35:00.000Z')).toBe(
      'warning',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:40:00.000Z')).toBe(
      'danger',
    );
  });

  it('keeps latest activity entries first and limited', () => {
    const session = createInitialSession();
    const withActivities = Array.from(
      { length: 22 },
      (_, index) => index,
    ).reduce(
      (current, index) =>
        appendActivity(
          current,
          createActivity(
            'mark-added',
            `รายการ ${index}`,
            `2026-05-25T10:${String(index).padStart(2, '0')}:00.000Z`,
          ),
        ),
      session,
    );

    expect(withActivities.activityLog).toHaveLength(20);
    expect(withActivities.activityLog[0].message).toBe('รายการ 21');
    expect(withActivities.activityLog.at(-1)?.message).toBe('รายการ 2');
  });

  it('returns priority players with danger before warning', () => {
    const players = [
      { ...createPlayer('ปกติ'), waitingSince: '2026-05-25T10:18:00.000Z' },
      { ...createPlayer('แดง'), waitingSince: '2026-05-25T10:00:00.000Z' },
      { ...createPlayer('เหลือง'), waitingSince: '2026-05-25T10:04:00.000Z' },
    ];

    expect(
      getPriorityPlayers(players, '2026-05-25T10:20:00.000Z').map(
        (player) => player.name,
      ),
    ).toEqual(['แดง', 'เหลือง']);
  });

  it('exports a LINE-friendly session summary', () => {
    const players = [
      { ...createPlayer('A'), id: 'a', shuttleMarks: [1], paid: true },
      { ...createPlayer('B'), id: 'b', shuttleMarks: [], paid: false },
    ];

    expect(
      exportSessionSummary(
        {
          players,
          pricing: DEFAULT_PRICING,
          currentShuttleNumber: 1,
          activityLog: [],
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
        '2026-05-25',
        '2026-05-25T10:00:00.000Z',
      ),
    ).toContain('A 125 จ่ายแล้ว\nB 100 ค้าง');
  });

  it('calculates each player from the number of checked shuttle marks', () => {
    const player = createPlayer('A');
    const total = calculatePlayerTotal(
      { ...player, shuttleCount: 2, shuttleMarks: [1, 1] },
      DEFAULT_PRICING,
    );

    expect(total).toBe(150);
  });

  it('keeps at least the default shuttle columns and expands after the last used slot', () => {
    expect(
      getVisibleShuttleColumns([{ ...createPlayer('A'), shuttleCount: 0 }]),
    ).toBe(DEFAULT_SHUTTLE_COLUMNS);
    expect(
      getVisibleShuttleColumns([{ ...createPlayer('A'), shuttleCount: 7 }]),
    ).toBe(8);
  });

  it('does not expand visible columns from the current shuttle number alone', () => {
    expect(getVisibleShuttleColumnsForCurrent([], 24)).toBe(
      DEFAULT_SHUTTLE_COLUMNS,
    );
  });

  it('summarizes marks by shuttle number and keeps duplicate names', () => {
    const players = [
      { ...createPlayer('A'), shuttleMarks: [7] },
      { ...createPlayer('B'), shuttleMarks: [7, 7] },
      { ...createPlayer('C'), shuttleMarks: [7] },
      { ...createPlayer('D'), shuttleMarks: [24] },
    ];

    expect(getShuttleMarkSummary(players, 7)).toEqual({
      shuttleNumber: 7,
      count: 4,
      names: ['A', 'B', 'B', 'C'],
      isComplete: true,
      missingCount: 0,
    });
    expect(getShuttleMarkSummary(players, 24)).toEqual({
      shuttleNumber: 24,
      count: 1,
      names: ['D'],
      isComplete: false,
      missingCount: 3,
    });
  });

  it('summarizes unpaid total, paid amount, and remaining amount', () => {
    const players = [
      {
        ...createPlayer('A'),
        shuttleCount: 2,
        paid: true,
        paidAt: '2026-05-24T02:00:00.000Z',
      },
      { ...createPlayer('B'), shuttleCount: 1, paid: false },
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toEqual({
      playerCount: 2,
      shuttleCount: 1,
      totalAmount: 100,
      paidAmount: 125,
      unpaidAmount: 100,
    });
  });

  it("keeps paid players' shuttle marks in the remaining session calculation", () => {
    const players = [
      {
        ...createPlayer('A'),
        shuttleMarks: [1],
        paid: true,
        paidAt: '2026-05-24T02:00:00.000Z',
      },
      { ...createPlayer('B'), shuttleMarks: [1], paid: false },
      { ...createPlayer('C'), shuttleMarks: [1], paid: false },
      { ...createPlayer('D'), shuttleMarks: [1], paid: false },
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toEqual({
      playerCount: 4,
      shuttleCount: 1,
      totalAmount: 300,
      paidAmount: 125,
      unpaidAmount: 300,
    });
  });

  it('groups paid players by the day they paid', () => {
    const players = [
      {
        ...createPlayer('A'),
        shuttleCount: 2,
        paid: true,
        paidAt: '2026-05-24T02:00:00.000Z',
      },
      {
        ...createPlayer('B'),
        shuttleCount: 1,
        paid: true,
        paidAt: '2026-05-24T03:00:00.000Z',
      },
      {
        ...createPlayer('C'),
        shuttleCount: 4,
        paid: true,
        paidAt: '2026-05-25T02:00:00.000Z',
      },
      { ...createPlayer('D'), shuttleCount: 3, paid: false },
    ];

    expect(groupPaidPlayersByDay(players, DEFAULT_PRICING)).toEqual([
      {
        dateKey: '2026-05-25',
        totalAmount: 125,
        players: [{ name: 'C', shuttleCount: 4, amount: 200 }],
      },
      {
        dateKey: '2026-05-24',
        totalAmount: 225,
        players: [
          { name: 'A', shuttleCount: 2, amount: 150 },
          { name: 'B', shuttleCount: 1, amount: 125 },
        ],
      },
    ]);
  });

  it('groups matches by shuttle number and keeps duplicate marks', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1, 2, 3] },
      { ...createPlayer('b'), shuttleMarks: [1, 3, 3] },
      { ...createPlayer('c'), shuttleMarks: [1, 2, 3] },
      { ...createPlayer('d'), shuttleMarks: [1] },
      { ...createPlayer('e'), shuttleMarks: [2] },
      { ...createPlayer('f'), shuttleMarks: [2] },
    ];

    expect(groupMatchesByShuttle(players)).toEqual([
      {
        shuttleNumber: 1,
        playerNames: ['a', 'b', 'c', 'd'],
        isIncomplete: false,
        isOverLimit: false,
      },
      {
        shuttleNumber: 2,
        playerNames: ['a', 'c', 'e', 'f'],
        isIncomplete: false,
        isOverLimit: false,
      },
      {
        shuttleNumber: 3,
        playerNames: ['a', 'b', 'b', 'c'],
        isIncomplete: false,
        isOverLimit: false,
      },
    ]);
  });

  it('marks match groups with fewer than four marks as incomplete', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1] },
      { ...createPlayer('b'), shuttleMarks: [1] },
      { ...createPlayer('c'), shuttleMarks: [1] },
    ];

    expect(groupMatchesByShuttle(players)).toEqual([
      {
        shuttleNumber: 1,
        playerNames: ['a', 'b', 'c'],
        isIncomplete: true,
        isOverLimit: false,
      },
    ]);
  });

  it('marks match groups with more than four players as over limit', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1] },
      { ...createPlayer('b'), shuttleMarks: [1] },
      { ...createPlayer('c'), shuttleMarks: [1] },
      { ...createPlayer('d'), shuttleMarks: [1] },
      { ...createPlayer('e'), shuttleMarks: [1] },
    ];

    expect(groupMatchesByShuttle(players)).toEqual([
      {
        shuttleNumber: 1,
        playerNames: ['a', 'b', 'c', 'd', 'e'],
        isIncomplete: false,
        isOverLimit: true,
      },
    ]);
  });

  it('finds a previous match with at least three overlapping unique player names', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1, 2] },
      { ...createPlayer('b'), shuttleMarks: [1, 2] },
      { ...createPlayer('c'), shuttleMarks: [1, 2] },
      { ...createPlayer('d'), shuttleMarks: [1] },
      { ...createPlayer('e'), shuttleMarks: [2] },
    ];

    expect(findMatchOverlapWarning(players, 2)).toEqual({
      shuttleNumber: 1,
      overlapNames: ['a', 'b', 'c'],
      overlapCount: 3,
    });
  });

  it('does not warn when fewer than three unique player names overlap', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1, 2] },
      { ...createPlayer('b'), shuttleMarks: [1, 2] },
      { ...createPlayer('c'), shuttleMarks: [1] },
      { ...createPlayer('d'), shuttleMarks: [1] },
      { ...createPlayer('e'), shuttleMarks: [2] },
      { ...createPlayer('f'), shuttleMarks: [2] },
    ];

    expect(findMatchOverlapWarning(players, 2)).toBeNull();
  });

  it('returns the strongest previous overlap and ignores the target shuttle itself', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1, 2, 3] },
      { ...createPlayer('b'), shuttleMarks: [1, 2, 3] },
      { ...createPlayer('c'), shuttleMarks: [1, 3] },
      { ...createPlayer('d'), shuttleMarks: [1, 3] },
      { ...createPlayer('e'), shuttleMarks: [2] },
      { ...createPlayer('f'), shuttleMarks: [2] },
    ];

    expect(findMatchOverlapWarning(players, 3)).toEqual({
      shuttleNumber: 1,
      overlapNames: ['a', 'b', 'c', 'd'],
      overlapCount: 4,
    });
  });
});
