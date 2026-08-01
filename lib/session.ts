import {
  PaymentAccountId,
  normalizePaymentAccountId,
} from './payment-accounts';

export type PlayerSkillLevel = 'bg' | 'n' | 's' | 'p-' | 'p';

export type Player = {
  id: string;
  name: string;
  shuttleCount: number;
  shuttleMarks?: number[];
  skillLevel: PlayerSkillLevel;
  paid: boolean;
  paidAt?: string;
  paidAmount?: number;
  paidAccountId?: PaymentAccountId;
  joinedAt?: string;
  waitingSince?: string;
  restUntil?: string;
  gameCount: number;
};

export type Pricing = {
  baseFee: number;
  shuttleFee: number;
};

export type MatchSource = 'batch' | 'planned' | 'manual';

export type SessionState = {
  players: Player[];
  pricing: Pricing;
  currentShuttleNumber: number;
  plannedMatches: PlannedMatch[];
  matchSources?: Record<string, MatchSource>;
  activityLog: ActivityLogEntry[];
  updatedAt: string;
};

export type PlannedMatch = {
  id: string;
  label: string;
  playerIds: string[];
  confirmed: boolean;
};

export type SessionSummary = {
  playerCount: number;
  shuttleCount: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
};

export type PaidPlayerSummary = {
  name: string;
  shuttleCount: number;
  amount: number;
  calculatedAmount: number;
  paidAt?: string;
  paidAccountId: PaymentAccountId;
};

export type PaidDaySummary = {
  dateKey: string;
  totalAmount: number;
  players: PaidPlayerSummary[];
};

export type MatchSummary = {
  shuttleNumber: number;
  playerNames: string[];
  isIncomplete: boolean;
  isOverLimit: boolean;
  source?: 'batch' | 'planned' | 'manual';
  startedAt?: string;
};

export type MatchOverlapWarning = {
  shuttleNumber: number;
  overlapNames: string[];
  overlapCount: number;
};

export type PlannedMatchSuggestion = {
  players: Player[];
  missingCount: number;
};

export type ShuttleMarkEntry = {
  playerId: string;
  playerName: string;
  columnIndex: number;
};

export type ShuttleMarkSummary = {
  shuttleNumber: number;
  count: number;
  names: string[];
  entries: ShuttleMarkEntry[];
  isComplete: boolean;
  missingCount: number;
};

export type PlayerWaitStatus = 'normal' | 'warning' | 'danger';

export type ActivityLogEntry = {
  id: string;
  action:
    | 'mark-added'
    | 'mark-removed'
    | 'match-confirmed'
    | 'paid'
    | 'unpaid'
    | 'player-removed';
  message: string;
  createdAt: string;
};

export const DEFAULT_PRICING: Pricing = {
  baseFee: 90,
  shuttleFee: 26,
};

export const DEFAULT_SHUTTLE_COLUMNS = 6;
export const DEFAULT_PLANNED_MATCH_COUNT = 6;
export const REST_MINUTES = 20;
export const WAIT_WARNING_MINUTES = 20;
export const WAIT_DANGER_MINUTES = 35;
export const PLAYER_SKILL_LEVELS: PlayerSkillLevel[] = ['bg', 'n', 's', 'p-', 'p'];
export const DEFAULT_PLAYER_SKILL_LEVEL: PlayerSkillLevel = 'n';

export const STORAGE_KEY = 'badminton-fee-book.session';

export function createPlayer(name: string): Player {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    name: name.trim(),
    shuttleCount: 0,
    shuttleMarks: [],
    skillLevel: DEFAULT_PLAYER_SKILL_LEVEL,
    paid: false,
    joinedAt: new Date().toISOString(),
    waitingSince: new Date().toISOString(),
    gameCount: 0,
  };
}

export function createInitialSession(): SessionState {
  return {
    players: [],
    pricing: DEFAULT_PRICING,
    currentShuttleNumber: 1,
    plannedMatches: createDefaultPlannedMatches(),
    matchSources: {},
    activityLog: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultPlannedMatches(): PlannedMatch[] {
  return Array.from({ length: DEFAULT_PLANNED_MATCH_COUNT }, (_, index) => ({
    id: `match-${index + 1}`,
    label: `Match ${index + 1}`,
    playerIds: [],
    confirmed: false,
  }));
}

export function renumberPlannedMatches(
  plannedMatches: PlannedMatch[],
): PlannedMatch[] {
  return plannedMatches.map((match, index) => ({
    ...match,
    label: `Match ${index + 1}`,
  }));
}

export function calculatePlayerTotal(player: Player, pricing: Pricing): number {
  return pricing.baseFee + getPlayerShuttleCount(player) * pricing.shuttleFee;
}

export function getPlayerPaymentAmount(player: Player, pricing: Pricing): number {
  return player.paid &&
    typeof player.paidAmount === 'number' &&
    Number.isFinite(player.paidAmount) &&
    player.paidAmount >= 0
    ? player.paidAmount
    : calculatePlayerTotal(player, pricing);
}

export function normalizePlayerSkillLevel(value: unknown): PlayerSkillLevel {
  return typeof value === 'string' &&
    PLAYER_SKILL_LEVELS.includes(value as PlayerSkillLevel)
    ? (value as PlayerSkillLevel)
    : DEFAULT_PLAYER_SKILL_LEVEL;
}

export function getPlayerSkillIndex(player: Player): number {
  const skillLevel = normalizePlayerSkillLevel(player.skillLevel);
  return PLAYER_SKILL_LEVELS.indexOf(skillLevel);
}

export function canSharePlannedMatch(players: Player[]): boolean {
  if (players.length <= 1) {
    return true;
  }

  const skillIndexes = players.map(getPlayerSkillIndex);
  return Math.max(...skillIndexes) - Math.min(...skillIndexes) <= 1;
}

export function calculatePlayersTotal(
  players: Player[],
  pricing: Pricing,
): number {
  const baseTotal = players.length * pricing.baseFee;
  const shuttleTotal = getBillableShuttleCount(players) * pricing.shuttleFee;

  return baseTotal + shuttleTotal;
}

export function calculatePlayersIndividualTotal(
  players: Player[],
  pricing: Pricing,
): number {
  return players.reduce(
    (sum, player) => sum + calculatePlayerTotal(player, pricing),
    0,
  );
}

export function getVisibleShuttleColumns(players: Player[]): number {
  const maxUsed = players.reduce(
    (max, player) =>
      Math.max(max, getPlayerShuttleCount(player), player.shuttleCount),
    0,
  );
  return Math.max(DEFAULT_SHUTTLE_COLUMNS, maxUsed + 1);
}

export function getPlayerShuttleMarks(player: Player): number[] {
  if (Array.isArray(player.shuttleMarks) && player.shuttleMarks.length > 0) {
    return player.shuttleMarks
      .map((mark) => Number(mark))
      .filter((mark) => Number.isInteger(mark) && mark > 0);
  }

  return Array.from(
    { length: Math.max(0, Number(player.shuttleCount) || 0) },
    (_, index) => index + 1,
  );
}

export function getPlayerShuttleCount(player: Player): number {
  return getPlayerShuttleMarks(player).length;
}

export function getBillableShuttleCount(players: Player[]): number {
  const markCount = players.reduce(
    (sum, player) => sum + getPlayerShuttleCount(player),
    0,
  );

  return Math.ceil(markCount / 4);
}

export function getNextOpenShuttleNumber(players: Player[]): number {
  const highestMarkedShuttle = players.reduce((highest, player) => {
    return Math.max(highest, ...getPlayerShuttleMarks(player));
  }, 0);

  return highestMarkedShuttle + 1;
}

export function getShuttleMarkSummary(
  players: Player[],
  shuttleNumber: number,
): ShuttleMarkSummary {
  const normalizedShuttleNumber = Math.max(1, Number(shuttleNumber) || 1);
  const entries = players.flatMap((player) =>
    getPlayerShuttleMarks(player)
      .map((mark, columnIndex) => ({ mark, columnIndex }))
      .filter(({ mark }) => mark === normalizedShuttleNumber)
      .map(({ columnIndex }) => ({
        playerId: player.id,
        playerName: player.name,
        columnIndex,
      })),
  );
  const names = entries.map((entry) => entry.playerName);
  const count = names.length;
  const remainder = count % 4;

  return {
    shuttleNumber: normalizedShuttleNumber,
    count,
    names,
    entries,
    isComplete: count > 0 && remainder === 0,
    missingCount: remainder === 0 ? 0 : 4 - remainder,
  };
}

export function hasShuttleMark(player: Player, shuttleNumber: number): boolean {
  return getPlayerShuttleMarks(player).includes(shuttleNumber);
}

export function setPlayerShuttleMarks(
  player: Player,
  shuttleMarks: number[],
): Player {
  const normalizedMarks = shuttleMarks
    .map((mark) => Number(mark))
    .filter((mark) => Number.isInteger(mark) && mark > 0);

  return {
    ...player,
    shuttleMarks: normalizedMarks,
    shuttleCount: normalizedMarks.length,
  };
}

export function getPlayerWaitStatus(
  player: Player,
  nowValue: string | Date = new Date(),
): PlayerWaitStatus {
  const now = typeof nowValue === 'string' ? new Date(nowValue) : nowValue;
  if (Number.isNaN(now.getTime())) {
    return 'normal';
  }

  const restUntil = parseDate(player.restUntil);
  if (restUntil && now < restUntil) {
    return 'normal';
  }

  const waitingStart = restUntil ?? parseDate(player.waitingSince);
  if (!waitingStart) {
    return 'normal';
  }

  const waitedMinutes = (now.getTime() - waitingStart.getTime()) / 60000;
  if (waitedMinutes >= WAIT_DANGER_MINUTES) {
    return 'danger';
  }
  if (waitedMinutes >= WAIT_WARNING_MINUTES) {
    return 'warning';
  }
  return 'normal';
}

export function createActivity(
  action: ActivityLogEntry['action'],
  message: string,
  createdAt = new Date().toISOString(),
): ActivityLogEntry {
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
    action,
    message,
    createdAt,
  };
}

export function appendActivity(
  session: SessionState,
  activity: ActivityLogEntry,
  limit = 20,
): SessionState {
  return {
    ...session,
    activityLog: [activity, ...(session.activityLog ?? [])].slice(0, limit),
  };
}

export function getPriorityPlayers(
  players: Player[],
  nowValue: string | Date = new Date(),
): Player[] {
  const rank = { danger: 0, warning: 1, normal: 2 } as const;
  return players
    .filter((player) => !player.paid)
    .map((player) => ({
      player,
      status: getPlayerWaitStatus(player, nowValue),
    }))
    .filter(({ status }) => status !== 'normal')
    .sort((first, second) => rank[first.status] - rank[second.status])
    .map(({ player }) => player);
}

export function getPlannedMatchSuggestion({
  players,
  plannedMatches,
  targetMatchId,
  now,
  suggestionIndex = 0,
}: {
  players: Player[];
  plannedMatches: PlannedMatch[];
  targetMatchId: string;
  now: string | Date;
  suggestionIndex?: number;
}): PlannedMatchSuggestion | null {
  const targetMatch = plannedMatches.find((match) => match.id === targetMatchId);
  if (!targetMatch || targetMatch.playerIds.length >= 4) {
    return null;
  }

  const playerById = new Map(players.map((player) => [player.id, player]));
  const existingPlayers = targetMatch.playerIds
    .map((playerId) => playerById.get(playerId))
    .filter((player): player is Player => Boolean(player));
  if (existingPlayers.length !== targetMatch.playerIds.length) {
    return null;
  }

  const missingCount = 4 - existingPlayers.length;
  const plannedPlayerIds = new Set(plannedMatches.flatMap((match) => match.playerIds));
  targetMatch.playerIds.forEach((playerId) => plannedPlayerIds.delete(playerId));
  const waitRank: Record<PlayerWaitStatus, number> = {
    danger: 0,
    warning: 1,
    normal: 2,
  };
  const orderedCandidates = players
    .filter((player) => !player.paid)
    .filter((player) => !targetMatch.playerIds.includes(player.id))
    .filter((player) => !plannedPlayerIds.has(player.id))
    .sort((first, second) => {
      const firstStatus = getPlayerWaitStatus(first, now);
      const secondStatus = getPlayerWaitStatus(second, now);
      return (
        waitRank[firstStatus] - waitRank[secondStatus] ||
        first.gameCount - second.gameCount ||
        first.name.localeCompare(second.name, 'th-TH', { sensitivity: 'base' })
      );
    });
  const normalizedSuggestionIndex = Math.max(0, Math.floor(suggestionIndex));
  const candidateOffset =
    orderedCandidates.length > 0
      ? (normalizedSuggestionIndex * missingCount) % orderedCandidates.length
      : 0;
  const rotatedCandidates = [
    ...orderedCandidates.slice(candidateOffset),
    ...orderedCandidates.slice(0, candidateOffset),
  ];

  const combinations = findPlannedMatchCandidateCombinations(
    rotatedCandidates,
    missingCount,
    existingPlayers,
  );
  const selected = combinations[0] ?? null;

  return selected ? { players: selected, missingCount } : null;
}

function findPlannedMatchCandidateCombinations(
  candidates: Player[],
  missingCount: number,
  existingPlayers: Player[],
): Player[][] {
  if (missingCount <= 0) {
    return [[]];
  }

  const results: Player[][] = [];

  function search(startIndex: number, selected: Player[]) {
    if (selected.length === missingCount) {
      if (canUsePlannedMatchSuggestion(existingPlayers, selected, missingCount)) {
        results.push(selected);
      }
      return;
    }

    for (let index = startIndex; index < candidates.length; index += 1) {
      const nextSelected = [...selected, candidates[index]];
      if (canSharePlannedMatch([...existingPlayers, ...nextSelected])) {
        search(index + 1, nextSelected);
      }
    }
  }

  search(0, []);
  return results;
}

function canUsePlannedMatchSuggestion(
  existingPlayers: Player[],
  selectedPlayers: Player[],
  missingCount: number,
): boolean {
  if (!canSharePlannedMatch([...existingPlayers, ...selectedPlayers])) {
    return false;
  }

  if (missingCount === 2 && selectedPlayers.length === 2) {
    return selectedPlayers[0].skillLevel === selectedPlayers[1].skillLevel;
  }

  return true;
}

export function exportSessionSummary(
  session: SessionState,
  sessionId: string,
  nowValue: string | Date = new Date(),
): string {
  const summary = summarizeSession(session.players, session.pricing);
  const paidNames = new Set(
    session.players.filter((player) => player.paid).map((player) => player.id),
  );
  const lines = [
    `สรุปรอบ ${sessionId}`,
    `วันที่ ${toDateKey(typeof nowValue === 'string' ? nowValue : nowValue.toISOString())}`,
    `ลูกทั้งหมด ${summary.shuttleCount} ลูก`,
    `รวม ${summary.totalAmount} บาท`,
    `จ่ายแล้ว ${summary.paidAmount} บาท`,
    `ค้าง ${summary.unpaidAmount} บาท`,
    '',
    ...session.players.map((player) => {
      const amount = getPlayerPaymentAmount(player, session.pricing);
      return `${player.name} ${amount} ${paidNames.has(player.id) ? 'จ่ายแล้ว' : 'ค้าง'}`;
    }),
  ];

  return lines.join('\n');
}

export function getVisibleShuttleColumnsForCurrent(
  players: Player[],
  currentShuttleNumber: number,
): number {
  return getVisibleShuttleColumns(players);
}

export function summarizeSession(
  players: Player[],
  pricing: Pricing,
): SessionSummary {
  const paidPlayers = players.filter((player) => player.paid);
  const unpaidPlayers = players.filter((player) => !player.paid);
  const shuttleCountFromMarks = getBillableShuttleCount(players);
  const matchCount = groupMatchesByShuttle(players).length;
  const shuttleCount = Math.max(shuttleCountFromMarks, matchCount);
  const paidAmount = paidPlayers.reduce(
    (sum, player) => sum + getPlayerPaymentAmount(player, pricing),
    0,
  );
  const unpaidAmount = calculatePlayersIndividualTotal(unpaidPlayers, pricing);
  const sessionAmount = paidAmount + unpaidAmount;

  return {
    playerCount: players.length,
    shuttleCount,
    totalAmount: sessionAmount,
    paidAmount,
    unpaidAmount,
  };
}

export function groupPaidPlayersByDay(
  players: Player[],
  pricing: Pricing,
): PaidDaySummary[] {
  const groups = new Map<string, PaidDaySummary>();

  players
    .filter((player) => player.paid)
    .forEach((player) => {
      const dateKey = toDateKey(player.paidAt ?? new Date().toISOString());
      const current = groups.get(dateKey) ?? {
        dateKey,
        totalAmount: 0,
        players: [],
      };

      current.players.push({
        name: player.name,
        shuttleCount: getPlayerShuttleCount(player),
        amount: getPlayerPaymentAmount(player, pricing),
        calculatedAmount: calculatePlayerTotal(player, pricing),
        paidAt: player.paidAt,
        paidAccountId: normalizePaymentAccountId(player.paidAccountId),
      });
      current.totalAmount = current.players.reduce(
        (sum, paidPlayer) => sum + paidPlayer.amount,
        0,
      );
      groups.set(dateKey, current);
    });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      players: [...group.players].sort((first, second) =>
        (second.paidAt ?? '').localeCompare(first.paidAt ?? ''),
      ),
    }))
    .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
}

export function groupMatchesByShuttle(
  players: Player[],
  activityLog?: ActivityLogEntry[],
  persistedSources?: Record<string, MatchSource>,
): MatchSummary[] {
  const groups = new Map<number, string[]>();

  players.forEach((player) => {
    getPlayerShuttleMarks(player).forEach((shuttleNumber) => {
      const current = groups.get(shuttleNumber) ?? [];
      current.push(player.name);
      groups.set(shuttleNumber, current);
    });
  });

  const sourceMap = new Map<number, MatchSource>();
  if (persistedSources) {
    Object.entries(persistedSources).forEach(([shuttleNumber, source]) => {
      const parsedShuttleNumber = Number(shuttleNumber);
      if (Number.isInteger(parsedShuttleNumber) && parsedShuttleNumber > 0) {
        sourceMap.set(parsedShuttleNumber, source);
      }
    });
  }
  const startedAtMap = new Map<number, string>();
  if (activityLog) {
    for (let i = activityLog.length - 1; i >= 0; i--) {
      const activity = activityLog[i];
      if (activity.action === 'match-confirmed') {
        const match = activity.message.match(/ลูก\s*(\d+)/);
        if (match) {
          const shuttleNumber = parseInt(match[1], 10);
          if (!sourceMap.has(shuttleNumber)) {
            sourceMap.set(shuttleNumber, 'planned');
          }
          if (!startedAtMap.has(shuttleNumber)) {
            startedAtMap.set(shuttleNumber, activity.createdAt);
          }
        }
      } else if (activity.action === 'mark-added') {
        const batchMatch = activity.message.match(/เพิ่มลูกที่\s*(\d+)/);
        if (batchMatch) {
          const shuttleNumber = parseInt(batchMatch[1], 10);
          if (!sourceMap.has(shuttleNumber)) {
            sourceMap.set(shuttleNumber, 'batch');
          }
          if (!startedAtMap.has(shuttleNumber)) {
            startedAtMap.set(shuttleNumber, activity.createdAt);
          }
        } else {
          const manualMatch = activity.message.match(/ลงลูก\s*(\d+)/);
          if (manualMatch) {
            const shuttleNumber = parseInt(manualMatch[1], 10);
            if (!sourceMap.has(shuttleNumber)) {
              sourceMap.set(shuttleNumber, 'manual');
            }
            if (!startedAtMap.has(shuttleNumber)) {
              startedAtMap.set(shuttleNumber, activity.createdAt);
            }
          }
        }
      }
    }
  }

  return Array.from(groups.entries())
    .sort(([first], [second]) => second - first)
    .map(([shuttleNumber, playerNames]) => ({
      shuttleNumber,
      playerNames,
      isIncomplete: playerNames.length > 0 && playerNames.length < 4,
      isOverLimit: playerNames.length > 4,
      source: sourceMap.get(shuttleNumber) ?? 'manual',
      startedAt: startedAtMap.get(shuttleNumber),
    }));
}

export function findMatchOverlapWarning(
  players: Player[],
  targetShuttleNumber: number,
  minimumOverlap = 3,
): MatchOverlapWarning | null {
  const normalizedTargetShuttleNumber = Math.max(
    1,
    Number(targetShuttleNumber) || 1,
  );
  const matchGroups = groupMatchesByShuttle(players);
  const targetGroup = matchGroups.find(
    (group) => group.shuttleNumber === normalizedTargetShuttleNumber,
  );

  if (!targetGroup) {
    return null;
  }

  const targetNames = Array.from(new Set(targetGroup.playerNames));
  const warnings = matchGroups
    .filter((group) => group.shuttleNumber !== normalizedTargetShuttleNumber)
    .map((group) => {
      const previousNames = new Set(group.playerNames);
      const overlapNames = targetNames.filter((name) =>
        previousNames.has(name),
      );

      return {
        shuttleNumber: group.shuttleNumber,
        overlapNames,
        overlapCount: overlapNames.length,
      };
    })
    .filter((warning) => warning.overlapCount >= minimumOverlap)
    .sort(
      (first, second) =>
        second.overlapCount - first.overlapCount ||
        first.shuttleNumber - second.shuttleNumber,
    );

  return warnings[0] ?? null;
}

function toDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return toLocalDateKey(new Date());
  }
  return toLocalDateKey(date);
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeSession(value: unknown): SessionState {
  if (!value || typeof value !== 'object') {
    return createInitialSession();
  }

  const candidate = value as Partial<SessionState>;
  const pricing = {
    baseFee:
      typeof candidate.pricing?.baseFee === 'number'
        ? candidate.pricing.baseFee
        : DEFAULT_PRICING.baseFee,
    shuttleFee:
      typeof candidate.pricing?.shuttleFee === 'number'
        ? candidate.pricing.shuttleFee
        : DEFAULT_PRICING.shuttleFee,
  };

  const players = Array.isArray(candidate.players)
    ? candidate.players
        .filter((player): player is Player => {
          return (
            typeof player === 'object' &&
            player !== null &&
            'id' in player &&
            'name' in player
          );
        })
        .map((player) =>
          setPlayerShuttleMarks(
            {
              id: String(player.id),
              name: String(player.name),
              shuttleCount: Math.max(0, Number(player.shuttleCount) || 0),
              skillLevel: normalizePlayerSkillLevel(player.skillLevel),
              paid: Boolean(player.paid),
              paidAt:
                typeof player.paidAt === 'string' ? player.paidAt : undefined,
              paidAmount:
                typeof player.paidAmount === 'number' &&
                Number.isFinite(player.paidAmount)
                  ? Math.max(0, player.paidAmount)
                  : undefined,
              paidAccountId: player.paid
                ? normalizePaymentAccountId(player.paidAccountId)
                : undefined,
              joinedAt:
                typeof player.joinedAt === 'string'
                  ? player.joinedAt
                  : typeof player.waitingSince === 'string'
                    ? player.waitingSince
                    : new Date().toISOString(),
              waitingSince:
                typeof player.waitingSince === 'string'
                  ? player.waitingSince
                  : new Date().toISOString(),
              restUntil:
                typeof player.restUntil === 'string'
                  ? player.restUntil
                  : undefined,
              gameCount: Math.max(0, Number(player.gameCount) || 0),
            },
            Array.isArray(player.shuttleMarks)
              ? player.shuttleMarks
              : Array.from(
                  { length: Math.max(0, Number(player.shuttleCount) || 0) },
                  (_, index) => index + 1,
                ),
          ),
        )
    : [];
  const activePlayerIds = new Set(
    players.filter((player) => !player.paid).map((player) => player.id),
  );
  const usedPlannedPlayerIds = new Set<string>();
  const defaultPlannedMatches = createDefaultPlannedMatches();
  const candidatePlannedMatches = Array.isArray(candidate.plannedMatches)
    ? (candidate.plannedMatches as Partial<PlannedMatch>[])
    : [];
  const seenPlannedMatchIds = new Set<string>();
  const orderedCandidatePlannedMatches = candidatePlannedMatches
    .filter((match) => {
      if (!match || typeof match !== 'object') {
        return false;
      }
      const matchId = typeof match.id === 'string' ? match.id : '';
      if (!matchId || seenPlannedMatchIds.has(matchId)) {
        return false;
      }
      seenPlannedMatchIds.add(matchId);
      return true;
    })
    .slice(0, DEFAULT_PLANNED_MATCH_COUNT);
  const missingDefaultPlannedMatches = defaultPlannedMatches.filter(
    (match) => !seenPlannedMatchIds.has(match.id),
  );
  const plannedMatches = renumberPlannedMatches(
    [...orderedCandidatePlannedMatches, ...missingDefaultPlannedMatches]
      .slice(0, DEFAULT_PLANNED_MATCH_COUNT)
      .map((candidateMatch, index) => {
        const defaultMatch = defaultPlannedMatches[index];
        const playerIds = Array.isArray(candidateMatch?.playerIds)
          ? candidateMatch.playerIds
              .map((playerId) => String(playerId))
              .filter((playerId) => {
                if (
                  !activePlayerIds.has(playerId) ||
                  usedPlannedPlayerIds.has(playerId)
                ) {
                  return false;
                }
                usedPlannedPlayerIds.add(playerId);
                return true;
              })
              .slice(0, 4)
          : [];

        return {
          ...defaultMatch,
          id:
            typeof candidateMatch?.id === 'string'
              ? candidateMatch.id
              : defaultMatch.id,
          playerIds,
          // A match with players is an active plan, even when older data kept
          // confirmed=true after the same slot had previously been completed.
          confirmed:
            playerIds.length > 0
              ? false
              : typeof candidateMatch?.confirmed === 'boolean'
                ? candidateMatch.confirmed
                : false,
        };
      }),
  );

  return {
    players,
    pricing,
    currentShuttleNumber: Math.max(
      1,
      Number(candidate.currentShuttleNumber) || 1,
    ),
    plannedMatches,
    matchSources:
      candidate.matchSources && typeof candidate.matchSources === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.matchSources)
              .filter(([shuttleNumber, source]) =>
                /^\d+$/.test(shuttleNumber) &&
                ['batch', 'planned', 'manual'].includes(String(source)),
              )
              .map(([shuttleNumber, source]) => [
                shuttleNumber,
                source as MatchSource,
              ]),
          )
        : {},
    activityLog: Array.isArray(candidate.activityLog)
      ? candidate.activityLog
          .filter((activity): activity is ActivityLogEntry => {
            return (
              typeof activity === 'object' &&
              activity !== null &&
              'message' in activity &&
              'createdAt' in activity
            );
          })
          .map((activity) => ({
            id:
              typeof activity.id === 'string'
                ? activity.id
                : createActivity('mark-added', String(activity.message)).id,
            action:
              typeof activity.action === 'string'
                ? (activity.action as ActivityLogEntry['action'])
                : 'mark-added',
            message: String(activity.message),
            createdAt:
              typeof activity.createdAt === 'string'
                ? activity.createdAt
                : new Date().toISOString(),
          }))
          .slice(0, 20)
      : [],
    updatedAt:
      typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : new Date().toISOString(),
  };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
