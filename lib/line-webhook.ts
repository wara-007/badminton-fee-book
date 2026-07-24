import { createHmac, timingSafeEqual } from "crypto";

export type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  message?: {
    type?: string;
    text?: string;
  };
  postback?: {
    data?: string;
  };
  source?: {
    type?: string;
    groupId?: string;
    userId?: string;
  };
};

export type LineBalanceCommand = {
  playerQuery: string;
  sessionId: string;
};

export function isSetAdminGroupCommand(text: string): boolean {
  return text.trim() === "ตั้งกลุ่มแอดมิน";
}

export function getLinePublicMenuReply(text: string): string | null {
  const command = text.trim();
  if (command === "ตารางเล่น") {
    return [
      "ตารางเล่น",
      "อังคารและศุกร์ 20:00–00:30 น.",
      "อาทิตย์ 18:00–22:00 น.",
      "สนาม SP Badminton ลาดพร้าว 71 นาคนิวาส ซ.6",
      "ค่าสนามเหมา 90 บาท",
      "ลูก RSL No.1 ลูกละ 26 บาท",
    ].join("\n");
  }
  if (command === "ติดต่อ") {
    return [
      "ติดต่อ",
      "โทร. 089-081-0878",
      "LINE ID: Gu_Pu2499",
    ].join("\n");
  }
  return null;
}

export function verifyLineWebhookSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;

  const expected = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function getLineGroupIds(events: LineWebhookEvent[]): string[] {
  return Array.from(new Set(
    events
      .filter((event) => event.source?.type === "group")
      .map((event) => event.source?.groupId)
      .filter((groupId): groupId is string => Boolean(groupId?.startsWith("C"))),
  ));
}

export function getBangkokDateKey(nowValue: string | Date = new Date()): string {
  const date = typeof nowValue === "string" ? new Date(nowValue) : nowValue;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid LINE command date");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function parseLineBalanceCommand(
  text: string,
  nowValue: string | Date = new Date(),
): LineBalanceCommand | null {
  const match = text.trim().match(/^ยอด\s+(.+?)(?:\s+(\d{4}-\d{2}-\d{2}))?$/u);
  if (!match) return null;

  const playerQuery = match[1]?.trim() ?? "";
  const sessionId = match[2] ?? getBangkokDateKey(nowValue);
  if (!playerQuery || !isValidDateKey(sessionId)) return null;

  return { playerQuery, sessionId };
}

export function normalizeLinePlayerName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/\s+/g, "");
}

export function findLinePlayerMatches<T extends { name: string }>(
  players: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeLinePlayerName(query);
  if (!normalizedQuery) return [];

  const exact = players.filter(
    (player) => normalizeLinePlayerName(player.name) === normalizedQuery,
  );
  if (exact.length > 0) return exact;

  return players.filter((player) =>
    normalizeLinePlayerName(player.name).includes(normalizedQuery),
  );
}

export function isLineAdmin(
  userId: string | undefined,
  configuredAdminIds = process.env.LINE_ADMIN_USER_IDS,
  fallbackRecipient = process.env.LINE_ALERT_TO,
): boolean {
  if (!userId) return false;

  const adminIds = (configuredAdminIds ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("U"));
  if (adminIds.length === 0 && fallbackRecipient?.startsWith("U")) {
    adminIds.push(fallbackRecipient);
  }

  return adminIds.includes(userId);
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
