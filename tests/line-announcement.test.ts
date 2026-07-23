import { describe, expect, it } from "vitest";
import {
  createLineAnnouncementText,
  getLineAnnouncementSchedule,
} from "@/lib/line-announcement";

describe("scheduled LINE announcement", () => {
  it.each([
    ["2026-07-21T06:00:00.000Z", "2026-07-21", "วันอังคาร"],
    ["2026-07-24T06:00:00.000Z", "2026-07-24", "วันศุกร์"],
    ["2026-07-26T06:00:00.000Z", "2026-07-26", "วันอาทิตย์"],
  ])("uses the Bangkok weekday", (now, dateKey, thaiWeekday) => {
    expect(getLineAnnouncementSchedule(now)).toMatchObject({
      dateKey,
      thaiWeekday,
      isAnnouncementDay: true,
    });
  });

  it("does not schedule other weekdays", () => {
    expect(
      getLineAnnouncementSchedule("2026-07-23T06:00:00.000Z")
        .isAnnouncementDay,
    ).toBe(false);
  });

  it("builds the public announcement without an admin room URL", () => {
    const text = createLineAnnouncementText("วันศุกร์");
    expect(text).toContain("#วันศุกร์ #แล้วแต่ปุ๊");
    expect(text).toContain("20:00-00:30");
    expect(text).not.toContain("?room=");
  });

  it("uses the earlier Sunday playing time", () => {
    const text = createLineAnnouncementText("วันอาทิตย์");
    expect(text).toContain("เริ่ม 18:00-22:00 น.");
    expect(text).not.toContain("20:00-00:30");
  });

  it("does not include emoji in the announcement text", () => {
    const text = createLineAnnouncementText("วันศุกร์");
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
