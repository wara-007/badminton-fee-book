const ANNOUNCEMENT_WEEKDAYS = new Set(["Tue", "Fri", "Sun"]);

const THAI_WEEKDAYS: Record<string, string> = {
  Tue: "วันอังคาร",
  Fri: "วันศุกร์",
  Sun: "วันอาทิตย์",
};

export type LineAnnouncementSchedule = {
  dateKey: string;
  weekday: string;
  thaiWeekday: string;
  isAnnouncementDay: boolean;
};

export function getLineAnnouncementSchedule(
  nowValue: string | Date = new Date(),
): LineAnnouncementSchedule {
  const now = typeof nowValue === "string" ? new Date(nowValue) : nowValue;
  if (Number.isNaN(now.getTime())) {
    throw new Error("Invalid LINE announcement date");
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

  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    weekday,
    thaiWeekday: THAI_WEEKDAYS[weekday] ?? "",
    isAnnouncementDay: ANNOUNCEMENT_WEEKDAYS.has(weekday),
  };
}

export function createLineAnnouncementText(thaiWeekday: string): string {
  const playTime =
    thaiWeekday === "วันอาทิตย์" ? "18:00-22:00 น." : "20:00-00:30 น.";

  return [
    `#${thaiWeekday} #แล้วแต่ปุ๊`,
    `เริ่ม ${playTime}`,
    "สนาม #SPBadminton",
    "ลาดพร้าว 71 นาคนิวาส ซ.6",
    "",
    "ค่าสนาม เหมา 90 บาท",
    "ลูก RSL No.1 ลูกละ 26 บาท",
    "เริ่มคอร์ท 1-2-3 และ 4-5-6 และ 7-8",
    "รองรับมือ N, S, P",
    "",
    "โทร. 089-081-0878",
    "LINE ID: Gu_Pu2499",
  ].join("\n");
}
