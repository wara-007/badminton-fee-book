import { describe, expect, it } from "vitest";
import { createDatabaseUsage, getDatabaseUsageLevel } from "@/lib/database-usage";

describe("database usage", () => {
  it("uses warning and critical thresholds at 80 and 90 percent", () => {
    expect(getDatabaseUsageLevel(79.9)).toBe("normal");
    expect(getDatabaseUsageLevel(80)).toBe("warning");
    expect(getDatabaseUsageLevel(90)).toBe("critical");
  });

  it("calculates a stable percentage", () => {
    expect(createDatabaseUsage(400, 500, "2026-07-21T00:00:00.000Z")).toEqual({
      usedBytes: 400,
      limitBytes: 500,
      percentUsed: 80,
      level: "warning",
      checkedAt: "2026-07-21T00:00:00.000Z",
    });
  });
});
