export type Player = {
  id: string;
  name: string;
  shuttleCount: number;
  shuttleMarks?: number[];
  paid: boolean;
  paidAt?: string;
};

export type Pricing = {
  baseFee: number;
  shuttleFee: number;
};

export type SessionState = {
  players: Player[];
  pricing: Pricing;
  currentShuttleNumber: number;
  updatedAt: string;
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
};

export type PaidDaySummary = {
  dateKey: string;
  totalAmount: number;
  players: PaidPlayerSummary[];
};

export type MatchSummary = {
  shuttleNumber: number;
  playerNames: string[];
};

export const DEFAULT_PRICING: Pricing = {
  baseFee: 100,
  shuttleFee: 25
};

export const DEFAULT_SHUTTLE_COLUMNS = 10;

export const STORAGE_KEY = "badminton-fee-book.session";

export function createPlayer(name: string): Player {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    name: name.trim(),
    shuttleCount: 0,
    shuttleMarks: [],
    paid: false
  };
}

export function createInitialSession(): SessionState {
  return {
    players: [],
    pricing: DEFAULT_PRICING,
    currentShuttleNumber: 1,
    updatedAt: new Date().toISOString()
  };
}

export function calculatePlayerTotal(player: Player, pricing: Pricing): number {
  return pricing.baseFee + getPlayerShuttleCount(player) * pricing.shuttleFee;
}

export function getVisibleShuttleColumns(players: Player[]): number {
  const maxUsed = players.reduce(
    (max, player) => Math.max(max, getPlayerShuttleCount(player), player.shuttleCount),
    0
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
    (_, index) => index + 1
  );
}

export function getPlayerShuttleCount(player: Player): number {
  return getPlayerShuttleMarks(player).length;
}

export function hasShuttleMark(player: Player, shuttleNumber: number): boolean {
  return getPlayerShuttleMarks(player).includes(shuttleNumber);
}

export function setPlayerShuttleMarks(player: Player, shuttleMarks: number[]): Player {
  const normalizedMarks = shuttleMarks
    .map((mark) => Number(mark))
    .filter((mark) => Number.isInteger(mark) && mark > 0);

  return {
    ...player,
    shuttleMarks: normalizedMarks,
    shuttleCount: normalizedMarks.length
  };
}

export function getVisibleShuttleColumnsForCurrent(
  players: Player[],
  currentShuttleNumber: number
): number {
  return Math.max(getVisibleShuttleColumns(players), Math.max(1, currentShuttleNumber));
}

export function summarizeSession(players: Player[], pricing: Pricing): SessionSummary {
  const shuttleCount = players.reduce((sum, player) => sum + getPlayerShuttleCount(player), 0);
  const paidAmount = players.reduce(
    (sum, player) => sum + (player.paid ? calculatePlayerTotal(player, pricing) : 0),
    0
  );
  const unpaidAmount = players.reduce(
    (sum, player) => sum + (!player.paid ? calculatePlayerTotal(player, pricing) : 0),
    0
  );

  return {
    playerCount: players.length,
    shuttleCount,
    totalAmount: unpaidAmount,
    paidAmount,
    unpaidAmount
  };
}

export function groupPaidPlayersByDay(players: Player[], pricing: Pricing): PaidDaySummary[] {
  const groups = new Map<string, PaidDaySummary>();

  players
    .filter((player) => player.paid)
    .forEach((player) => {
      const dateKey = toDateKey(player.paidAt ?? new Date().toISOString());
      const amount = calculatePlayerTotal(player, pricing);
      const current = groups.get(dateKey) ?? {
        dateKey,
        totalAmount: 0,
        players: []
      };

      current.totalAmount += amount;
      current.players.push({
        name: player.name,
        shuttleCount: getPlayerShuttleCount(player),
        amount
      });
      groups.set(dateKey, current);
    });

  return Array.from(groups.values()).sort((first, second) =>
    second.dateKey.localeCompare(first.dateKey)
  );
}

export function groupMatchesByShuttle(players: Player[]): MatchSummary[] {
  const groups = new Map<number, string[]>();

  players.forEach((player) => {
    getPlayerShuttleMarks(player).forEach((shuttleNumber) => {
      const current = groups.get(shuttleNumber) ?? [];
      current.push(player.name);
      groups.set(shuttleNumber, current);
    });
  });

  return Array.from(groups.entries())
    .sort(([first], [second]) => first - second)
    .map(([shuttleNumber, playerNames]) => ({
      shuttleNumber,
      playerNames
    }));
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
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeSession(value: unknown): SessionState {
  if (!value || typeof value !== "object") {
    return createInitialSession();
  }

  const candidate = value as Partial<SessionState>;
  const pricing = {
    baseFee:
      typeof candidate.pricing?.baseFee === "number"
        ? candidate.pricing.baseFee
        : DEFAULT_PRICING.baseFee,
    shuttleFee:
      typeof candidate.pricing?.shuttleFee === "number"
        ? candidate.pricing.shuttleFee
        : DEFAULT_PRICING.shuttleFee
  };

  const players = Array.isArray(candidate.players)
    ? candidate.players
        .filter((player): player is Player => {
          return (
            typeof player === "object" &&
            player !== null &&
            "id" in player &&
            "name" in player
          );
        })
        .map((player) =>
          setPlayerShuttleMarks(
            {
              id: String(player.id),
              name: String(player.name),
              shuttleCount: Math.max(0, Number(player.shuttleCount) || 0),
              paid: Boolean(player.paid),
              paidAt: typeof player.paidAt === "string" ? player.paidAt : undefined
            },
            Array.isArray(player.shuttleMarks)
              ? player.shuttleMarks
              : Array.from(
                  { length: Math.max(0, Number(player.shuttleCount) || 0) },
                  (_, index) => index + 1
                )
          )
        )
    : [];

  return {
    players,
    pricing,
    currentShuttleNumber: Math.max(1, Number(candidate.currentShuttleNumber) || 1),
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
  };
}
