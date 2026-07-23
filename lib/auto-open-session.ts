const AUTO_OPEN_WEEKDAYS = new Set(["Tue", "Fri", "Sun"]);

export type BangkokSchedule = {
  sessionId: string;
  weekday: string;
  isAutoOpenDay: boolean;
};

export type AutoOpenResult = {
  sessionId: string;
  status: "created" | "already-exists" | "not-scheduled";
  notified: boolean;
};

export function getBangkokSchedule(nowValue: string | Date = new Date()): BangkokSchedule {
  const now = typeof nowValue === "string" ? new Date(nowValue) : nowValue;
  if (Number.isNaN(now.getTime())) {
    throw new Error("Invalid auto-open date");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday");
  const sessionId = `${value("year")}-${value("month")}-${value("day")}`;

  return {
    sessionId,
    weekday,
    isAutoOpenDay: AUTO_OPEN_WEEKDAYS.has(weekday),
  };
}

export async function runAutoOpenSession(options: {
  now?: string | Date;
  allowUnscheduled?: boolean;
  createSession: (sessionId: string) => Promise<boolean>;
  notifySessionOpened: (sessionId: string) => Promise<boolean>;
}): Promise<AutoOpenResult> {
  const schedule = getBangkokSchedule(options.now);
  if (!schedule.isAutoOpenDay && !options.allowUnscheduled) {
    return { sessionId: schedule.sessionId, status: "not-scheduled", notified: false };
  }

  const created = await options.createSession(schedule.sessionId);
  if (!created) {
    return { sessionId: schedule.sessionId, status: "already-exists", notified: false };
  }

  const notified = await options.notifySessionOpened(schedule.sessionId);
  return { sessionId: schedule.sessionId, status: "created", notified };
}
