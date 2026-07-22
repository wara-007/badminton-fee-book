import { describe, expect, it, vi } from "vitest";
import { getBangkokSchedule, runAutoOpenSession } from "@/lib/auto-open-session";

describe("automatic session opening", () => {
  it.each([
    ["2026-07-21T09:00:00.000Z", "2026-07-21", "Tue"],
    ["2026-07-24T09:00:00.000Z", "2026-07-24", "Fri"],
    ["2026-07-26T09:00:00.000Z", "2026-07-26", "Sun"],
  ])("uses the Bangkok date on scheduled days", (now, sessionId, weekday) => {
    expect(getBangkokSchedule(now)).toEqual({
      sessionId,
      weekday,
      isAutoOpenDay: true,
    });
  });

  it("uses the next Bangkok date near the UTC day boundary", () => {
    expect(getBangkokSchedule("2026-07-20T18:00:00.000Z").sessionId).toBe("2026-07-21");
  });

  it("creates and announces a new scheduled session", async () => {
    const createSession = vi.fn().mockResolvedValue(true);
    const notifySessionOpened = vi.fn().mockResolvedValue(undefined);

    await expect(runAutoOpenSession({
      now: "2026-07-21T09:00:00.000Z",
      createSession,
      notifySessionOpened,
    })).resolves.toEqual({
      sessionId: "2026-07-21",
      status: "created",
      notified: true,
    });
    expect(createSession).toHaveBeenCalledWith("2026-07-21");
    expect(notifySessionOpened).toHaveBeenCalledWith("2026-07-21");
  });

  it("does not announce an existing session", async () => {
    const notifySessionOpened = vi.fn();

    await expect(runAutoOpenSession({
      now: "2026-07-21T09:00:00.000Z",
      createSession: vi.fn().mockResolvedValue(false),
      notifySessionOpened,
    })).resolves.toMatchObject({ status: "already-exists", notified: false });
    expect(notifySessionOpened).not.toHaveBeenCalled();
  });

  it("does nothing outside Tuesday, Friday, and Sunday", async () => {
    const createSession = vi.fn();

    await expect(runAutoOpenSession({
      now: "2026-07-22T09:00:00.000Z",
      createSession,
      notifySessionOpened: vi.fn(),
    })).resolves.toMatchObject({ status: "not-scheduled", notified: false });
    expect(createSession).not.toHaveBeenCalled();
  });
});
