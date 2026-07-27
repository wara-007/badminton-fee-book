import { createHmac, timingSafeEqual } from "node:crypto";

export const SUPPORT_ADMIN_COOKIE = "badminton-support-admin";
export const SUPPORT_ADMIN_SESSION_SECONDS = 12 * 60 * 60;

export type SupportAdminSession = {
  role: "admin" | "admin2";
  displayName: string;
  lineUserId: string;
  expiresAt: number;
};

function getSessionSecret(): string | null {
  return (
    process.env.SUPPORT_ADMIN_SESSION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.LINE_CHANNEL_SECRET ||
    null
  );
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function getSupportAdminCredentials(
  role: string,
): { password: string; session: Omit<SupportAdminSession, "expiresAt"> } | null {
  if (role !== "admin" && role !== "admin2") return null;
  const upperRole = role === "admin" ? "ADMIN" : "ADMIN2";
  const password =
    process.env[`SUPPORT_${upperRole}_PASSWORD`] ||
    (process.env.NODE_ENV !== "production"
      ? process.env[`NEXT_PUBLIC_${upperRole}_PASSWORD`] ||
        (role === "admin" ? "admin" : "admin2")
      : undefined);
  if (!password) return null;

  return {
    password,
    session: {
      role,
      displayName: role,
      lineUserId: role === "admin" ? "UWEB_ADMIN" : "UWEB_ADMIN2",
    },
  };
}

export function createSupportAdminToken(
  session: Omit<SupportAdminSession, "expiresAt">,
  now = Date.now(),
): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const payload = encode(
    JSON.stringify({
      ...session,
      expiresAt: now + SUPPORT_ADMIN_SESSION_SECONDS * 1000,
    }),
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySupportAdminToken(
  token: string | undefined,
  now = Date.now(),
): SupportAdminSession | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = sign(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decode(payload)) as Partial<SupportAdminSession>;
    if (
      (parsed.role !== "admin" && parsed.role !== "admin2") ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.lineUserId !== "string" ||
      !parsed.lineUserId.startsWith("UWEB_") ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now
    ) {
      return null;
    }
    return parsed as SupportAdminSession;
  } catch {
    return null;
  }
}
