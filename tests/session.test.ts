import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING,
  DEFAULT_SHUTTLE_COLUMNS,
  appendActivity,
  calculatePlayersTotal,
  calculatePlayersIndividualTotal,
  calculatePlayerTotal,
  createActivity,
  createDefaultPlannedMatches,
  createInitialSession,
  createPlayer,
  exportSessionSummary,
  findMatchOverlapWarning,
  getPlannedMatchSuggestion,
  getBillableShuttleCount,
  getNextOpenShuttleNumber,
  getPriorityPlayers,
  getPlayerWaitStatus,
  getShuttleMarkSummary,
  groupPaidPlayersByDay,
  groupMatchesByShuttle,
  getVisibleShuttleColumns,
  getVisibleShuttleColumnsForCurrent,
  normalizeSession,
  renumberPlannedMatches,
  summarizeSession,
} from '@/lib/session';

describe('badminton session calculations', () => {
  it('calculates each player from base fee plus checked marks', () => {
    const player = createPlayer('A');
    const total = calculatePlayerTotal(
      { ...player, shuttleCount: 3 },
      DEFAULT_PRICING,
    );

    expect(total).toBe(168);
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
    expect(calculatePlayersTotal(players, DEFAULT_PRICING)).toBe(502);
  });

  it('calculates individual totals by summing each player amount', () => {
    const players = [
      { ...createPlayer('A'), shuttleMarks: [1, 2] },
      { ...createPlayer('B'), shuttleMarks: [1] },
    ];

    expect(calculatePlayersIndividualTotal(players, DEFAULT_PRICING)).toBe(258);
  });

  it('calculates waiting status after signup and after rest time ends', () => {
    const player = {
      ...createPlayer('A'),
      waitingSince: '2026-05-25T10:00:00.000Z',
    };

    expect(getPlayerWaitStatus(player, '2026-05-25T10:19:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(player, '2026-05-25T10:20:00.000Z')).toBe(
      'warning',
    );
    expect(getPlayerWaitStatus(player, '2026-05-25T10:35:00.000Z')).toBe(
      'danger',
    );

    const restedPlayer = {
      ...player,
      restUntil: '2026-05-25T10:20:00.000Z',
    };

    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:19:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:39:59.000Z')).toBe(
      'normal',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:40:00.000Z')).toBe(
      'warning',
    );
    expect(getPlayerWaitStatus(restedPlayer, '2026-05-25T10:55:00.000Z')).toBe(
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
      { ...createPlayer('ปกติ'), waitingSince: '2026-05-25T10:45:00.000Z' },
      { ...createPlayer('แดง'), waitingSince: '2026-05-25T10:20:00.000Z' },
      { ...createPlayer('เหลือง'), waitingSince: '2026-05-25T10:35:00.000Z' },
    ];

    expect(
      getPriorityPlayers(players, '2026-05-25T11:00:00.000Z').map(
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
          plannedMatches: createDefaultPlannedMatches(),
          activityLog: [],
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
        '2026-05-25',
        '2026-05-25T10:00:00.000Z',
      ),
    ).toContain('A 116 จ่ายแล้ว\nB 90 ค้าง');
  });

  it('calculates each player from the number of checked shuttle marks', () => {
    const player = createPlayer('A');
    const total = calculatePlayerTotal(
      { ...player, shuttleCount: 2, shuttleMarks: [1, 1] },
      DEFAULT_PRICING,
    );

    expect(total).toBe(142);
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

    const playerA = players[0];
    const playerB = players[1];
    const playerC = players[2];
    const playerD = players[3];

    expect(getShuttleMarkSummary(players, 7)).toEqual({
      shuttleNumber: 7,
      count: 4,
      names: ['A', 'B', 'B', 'C'],
      entries: [
        { playerId: playerA.id, playerName: 'A', columnIndex: 0 },
        { playerId: playerB.id, playerName: 'B', columnIndex: 0 },
        { playerId: playerB.id, playerName: 'B', columnIndex: 1 },
        { playerId: playerC.id, playerName: 'C', columnIndex: 0 },
      ],
      isComplete: true,
      missingCount: 0,
    });
    expect(getShuttleMarkSummary(players, 24)).toEqual({
      shuttleNumber: 24,
      count: 1,
      names: ['D'],
      entries: [{ playerId: playerD.id, playerName: 'D', columnIndex: 0 }],
      isComplete: false,
      missingCount: 3,
    });
  });

  it('returns the next open shuttle number from actual marks', () => {
    const players = [
      { ...createPlayer('A'), shuttleMarks: [1, 2, 23] },
      { ...createPlayer('B'), shuttleMarks: [23] },
      { ...createPlayer('C'), shuttleMarks: [] },
    ];

    expect(getNextOpenShuttleNumber(players)).toBe(24);
    expect(getNextOpenShuttleNumber([])).toBe(1);
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
      shuttleCount: 2,
      totalAmount: 258,
      paidAmount: 142,
      unpaidAmount: 116,
    });
  });

  it('never reports fewer shuttles than recorded matches', () => {
    const players = [
      { ...createPlayer('A'), shuttleMarks: [1] },
      { ...createPlayer('B'), shuttleMarks: [2] },
      { ...createPlayer('C'), shuttleMarks: [3] },
    ];

    const summary = summarizeSession(players, DEFAULT_PRICING);

    expect(summary.shuttleCount).toBe(3);
    expect(groupMatchesByShuttle(players)).toHaveLength(3);
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
      totalAmount: 464,
      paidAmount: 116,
      unpaidAmount: 348,
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

    const amountA = calculatePlayerTotal(players[0], DEFAULT_PRICING);
    const amountB = calculatePlayerTotal(players[1], DEFAULT_PRICING);
    const amountC = calculatePlayerTotal(players[2], DEFAULT_PRICING);

    expect(groupPaidPlayersByDay(players, DEFAULT_PRICING)).toEqual([
      {
        dateKey: '2026-05-25',
        totalAmount: amountC,
        players: [{
          name: 'C',
          shuttleCount: 4,
          amount: amountC,
          calculatedAmount: amountC,
          paidAt: '2026-05-25T02:00:00.000Z',
          paidAccountId: 'gsb',
        }],
      },
      {
        dateKey: '2026-05-24',
        totalAmount: amountA + amountB,
        players: [
          {
            name: 'B',
            shuttleCount: 1,
            amount: amountB,
            calculatedAmount: amountB,
            paidAt: '2026-05-24T03:00:00.000Z',
            paidAccountId: 'gsb',
          },
          {
            name: 'A',
            shuttleCount: 2,
            amount: amountA,
            calculatedAmount: amountA,
            paidAt: '2026-05-24T02:00:00.000Z',
            paidAccountId: 'gsb',
          },
        ],
      },
    ]);
  });

  it('includes paid time in paid player summaries', () => {
    const paidAt = '2026-05-24T02:00:00.000Z';
    const players = [
      {
        ...createPlayer('A'),
        shuttleMarks: [1],
        paid: true,
        paidAt,
      },
    ];

    const [paidSummary] = groupPaidPlayersByDay(players, DEFAULT_PRICING);

    expect(paidSummary.players[0]).toMatchObject({
      name: 'A',
      paidAt,
      calculatedAmount: calculatePlayerTotal(players[0], DEFAULT_PRICING),
    });
  });

  it('uses an edited paid amount in paid summaries', () => {
    const players = [
      {
        ...createPlayer('A'),
        shuttleCount: 2,
        paid: true,
        paidAmount: 175,
        paidAt: '2026-05-24T02:00:00.000Z',
      },
      { ...createPlayer('B'), shuttleCount: 1, paid: false },
    ];

    expect(summarizeSession(players, DEFAULT_PRICING)).toMatchObject({
      totalAmount: 291,
      paidAmount: 175,
      unpaidAmount: 116,
    });
    const [paidSummary] = groupPaidPlayersByDay(players, DEFAULT_PRICING);

    expect(paidSummary.players[0]).toMatchObject({
      name: 'A',
      amount: 175,
      calculatedAmount: calculatePlayerTotal(players[0], DEFAULT_PRICING),
    });
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
        shuttleNumber: 3,
        playerNames: ['a', 'b', 'b', 'c'],
        isIncomplete: false,
        isOverLimit: false,
        source: 'manual',
        startedAt: undefined,
      },
      {
        shuttleNumber: 2,
        playerNames: ['a', 'c', 'e', 'f'],
        isIncomplete: false,
        isOverLimit: false,
        source: 'manual',
        startedAt: undefined,
      },
      {
        shuttleNumber: 1,
        playerNames: ['a', 'b', 'c', 'd'],
        isIncomplete: false,
        isOverLimit: false,
        source: 'manual',
        startedAt: undefined,
      },
    ]);
  });

  it('adds match start time from the related activity', () => {
    const players = [
      { ...createPlayer('a'), shuttleMarks: [1] },
      { ...createPlayer('b'), shuttleMarks: [1] },
      { ...createPlayer('c'), shuttleMarks: [1] },
      { ...createPlayer('d'), shuttleMarks: [1] },
    ];

    expect(
      groupMatchesByShuttle(players, [
        createActivity(
          'match-confirmed',
          'ยืนยันลูก 1: a, b, c, d',
          '2026-05-25T12:34:00.000Z',
        ),
      ])[0],
    ).toMatchObject({
      shuttleNumber: 1,
      startedAt: '2026-05-25T12:34:00.000Z',
    });
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
        source: 'manual',
        startedAt: undefined,
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
        source: 'manual',
        startedAt: undefined,
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

  it('creates six empty planned matches for a new session', () => {
    const session = createInitialSession();

    expect(session.plannedMatches).toEqual([
      { id: 'match-1', label: 'Match 1', playerIds: [], confirmed: false },
      { id: 'match-2', label: 'Match 2', playerIds: [], confirmed: false },
      { id: 'match-3', label: 'Match 3', playerIds: [], confirmed: false },
      { id: 'match-4', label: 'Match 4', playerIds: [], confirmed: false },
      { id: 'match-5', label: 'Match 5', playerIds: [], confirmed: false },
      { id: 'match-6', label: 'Match 6', playerIds: [], confirmed: false },
    ]);
  });

  it('normalizes planned matches and removes paid, missing, and duplicate player ids', () => {
    const activePlayer = { ...createPlayer('A'), id: 'a', paid: false };
    const paidPlayer = { ...createPlayer('B'), id: 'b', paid: true };

    const session = normalizeSession({
      players: [activePlayer, paidPlayer],
      pricing: DEFAULT_PRICING,
      currentShuttleNumber: 3,
      plannedMatches: [
        { id: 'match-1', label: 'Match 1', playerIds: ['a', 'b', 'missing'], confirmed: true },
        { id: 'match-2', label: 'Match 2', playerIds: ['a'] },
      ],
      activityLog: [],
      updatedAt: '2026-05-25T10:00:00.000Z',
    });

    expect(session.plannedMatches).toHaveLength(6);
    expect(session.plannedMatches[0].playerIds).toEqual(['a']);
    expect(session.plannedMatches[0].confirmed).toBe(false);
    expect(session.plannedMatches[1].playerIds).toEqual([]);
  });

  it('defaults missing skill levels to n when normalizing players', () => {
    const session = normalizeSession({
      players: [{ ...createPlayer('A'), id: 'a', paid: false }],
      pricing: DEFAULT_PRICING,
      currentShuttleNumber: 1,
      plannedMatches: createDefaultPlannedMatches(),
      activityLog: [],
      updatedAt: '2026-05-25T10:00:00.000Z',
    });

    expect(session.players[0].skillLevel).toBe('n');
  });

  it('suggests only players within one skill step for a planned match', () => {
    const players = [
      { ...createPlayer('N1'), id: 'n1', skillLevel: 'n' as const },
      { ...createPlayer('N2'), id: 'n2', skillLevel: 'n' as const },
      { ...createPlayer('S1'), id: 's1', skillLevel: 's' as const },
      { ...createPlayer('S2'), id: 's2', skillLevel: 's' as const },
      { ...createPlayer('P-'), id: 'p-', skillLevel: 'p-' as const },
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches: createDefaultPlannedMatches(),
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
      })?.players.map((player) => player.id),
    ).toEqual(['n1', 'n2', 's1', 's2']);
  });

  it('suggests only missing players and validates existing planned players', () => {
    const players = [
      { ...createPlayer('BG'), id: 'bg', skillLevel: 'bg' as const },
      { ...createPlayer('N1'), id: 'n1', skillLevel: 'n' as const },
      { ...createPlayer('N2'), id: 'n2', skillLevel: 'n' as const },
      { ...createPlayer('S1'), id: 's1', skillLevel: 's' as const },
      { ...createPlayer('S2'), id: 's2', skillLevel: 's' as const },
    ];
    const plannedMatches = [
      { ...createDefaultPlannedMatches()[0], playerIds: ['n1', 'n2'] },
      ...createDefaultPlannedMatches().slice(1),
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches,
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
      })?.players.map((player) => player.id),
    ).toEqual(['s1', 's2']);
  });

  it('fills two missing planned match slots with a same-skill pair', () => {
    const players = [
      { ...createPlayer('S locked 1'), id: 'locked-1', skillLevel: 's' as const },
      { ...createPlayer('S locked 2'), id: 'locked-2', skillLevel: 's' as const },
      { ...createPlayer('N single'), id: 'n-single', skillLevel: 'n' as const },
      { ...createPlayer('S single'), id: 's-single', skillLevel: 's' as const },
      { ...createPlayer('N pair 1'), id: 'n-pair-1', skillLevel: 'n' as const },
      { ...createPlayer('N pair 2'), id: 'n-pair-2', skillLevel: 'n' as const },
    ];
    const plannedMatches = [
      { ...createDefaultPlannedMatches()[0], playerIds: ['locked-1', 'locked-2'] },
      ...createDefaultPlannedMatches().slice(1),
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches,
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
      })?.players.map((player) => player.id),
    ).toEqual(['n-pair-1', 'n-pair-2']);
  });

  it('does not fill two missing planned match slots with mixed skill levels', () => {
    const players = [
      { ...createPlayer('S locked 1'), id: 'locked-1', skillLevel: 's' as const },
      { ...createPlayer('S locked 2'), id: 'locked-2', skillLevel: 's' as const },
      { ...createPlayer('N single'), id: 'n-single', skillLevel: 'n' as const },
      { ...createPlayer('S single'), id: 's-single', skillLevel: 's' as const },
    ];
    const plannedMatches = [
      { ...createDefaultPlannedMatches()[0], playerIds: ['locked-1', 'locked-2'] },
      ...createDefaultPlannedMatches().slice(1),
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches,
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('rotates planned match suggestions by a whole missing-player set', () => {
    const players = [
      { ...createPlayer('N1'), id: 'n1', skillLevel: 'n' as const },
      { ...createPlayer('N2'), id: 'n2', skillLevel: 'n' as const },
      { ...createPlayer('N3'), id: 'n3', skillLevel: 'n' as const },
      { ...createPlayer('N4'), id: 'n4', skillLevel: 'n' as const },
      { ...createPlayer('N5'), id: 'n5', skillLevel: 'n' as const },
      { ...createPlayer('N6'), id: 'n6', skillLevel: 'n' as const },
      { ...createPlayer('N7'), id: 'n7', skillLevel: 'n' as const },
      { ...createPlayer('N8'), id: 'n8', skillLevel: 'n' as const },
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches: createDefaultPlannedMatches(),
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
        suggestionIndex: 0,
      })?.players.map((player) => player.id),
    ).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches: createDefaultPlannedMatches(),
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
        suggestionIndex: 1,
      })?.players.map((player) => player.id),
    ).toEqual(['n5', 'n6', 'n7', 'n8']);
  });

  it('orders match suggestions by wait status and then fewer games', () => {
    const players = [
      {
        ...createPlayer('Warning low games'),
        id: 'warning-low',
        skillLevel: 'n' as const,
        waitingSince: '2026-05-25T10:30:00.000Z',
        gameCount: 1,
      },
      {
        ...createPlayer('Danger high games'),
        id: 'danger-high',
        skillLevel: 'n' as const,
        waitingSince: '2026-05-25T10:00:00.000Z',
        gameCount: 5,
      },
      {
        ...createPlayer('Danger low games'),
        id: 'danger-low',
        skillLevel: 'n' as const,
        waitingSince: '2026-05-25T10:00:00.000Z',
        gameCount: 0,
      },
      {
        ...createPlayer('Normal'),
        id: 'normal',
        skillLevel: 'n' as const,
        waitingSince: '2026-05-25T10:50:00.000Z',
        gameCount: 0,
      },
    ];

    expect(
      getPlannedMatchSuggestion({
        players,
        plannedMatches: createDefaultPlannedMatches(),
        targetMatchId: 'match-1',
        now: '2026-05-25T11:00:00.000Z',
      })?.players.map((player) => player.id),
    ).toEqual(['danger-low', 'danger-high', 'warning-low', 'normal']);
  });

  it('renumbers planned matches after their order changes', () => {
    const plannedMatches = createDefaultPlannedMatches();
    const reordered = renumberPlannedMatches([
      plannedMatches[1],
      plannedMatches[2],
      plannedMatches[0],
    ]);

    expect(reordered.map((match) => match.id)).toEqual([
      'match-2',
      'match-3',
      'match-1',
    ]);
    expect(reordered.map((match) => match.label)).toEqual([
      'Match 1',
      'Match 2',
      'Match 3',
    ]);
  });
});
