export const DEFAULT_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;

export type DatabaseUsage = {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  level: "normal" | "warning" | "critical";
  checkedAt: string;
};

export function getDatabaseUsageLevel(percentUsed: number): DatabaseUsage["level"] {
  if (percentUsed >= 90) return "critical";
  if (percentUsed >= 80) return "warning";
  return "normal";
}

export function createDatabaseUsage(
  usedBytes: number,
  limitBytes = DEFAULT_DATABASE_LIMIT_BYTES,
  checkedAt = new Date().toISOString(),
): DatabaseUsage {
  const safeUsedBytes = Math.max(0, Number(usedBytes) || 0);
  const safeLimitBytes = Math.max(1, Number(limitBytes) || DEFAULT_DATABASE_LIMIT_BYTES);
  const percentUsed = Math.round((safeUsedBytes / safeLimitBytes) * 1000) / 10;

  return {
    usedBytes: safeUsedBytes,
    limitBytes: safeLimitBytes,
    percentUsed,
    level: getDatabaseUsageLevel(percentUsed),
    checkedAt,
  };
}

export function formatMegabytes(bytes: number): string {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  );
}
