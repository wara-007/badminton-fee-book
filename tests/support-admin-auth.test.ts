import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupportAdminToken,
  getSupportAdminCredentials,
  verifySupportAdminToken,
} from "@/lib/support-admin-auth";

describe("support admin authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates and verifies a signed admin session", () => {
    vi.stubEnv("SUPPORT_ADMIN_SESSION_SECRET", "test-session-secret");
    const token = createSupportAdminToken(
      {
        role: "admin",
        displayName: "admin",
        lineUserId: "UWEB_ADMIN",
      },
      1_000,
    );

    expect(token).toBeTruthy();
    expect(verifySupportAdminToken(token ?? undefined, 2_000)).toMatchObject({
      role: "admin",
      displayName: "admin",
      lineUserId: "UWEB_ADMIN",
    });
  });

  it("rejects tampered and expired sessions", () => {
    vi.stubEnv("SUPPORT_ADMIN_SESSION_SECRET", "test-session-secret");
    const token = createSupportAdminToken(
      {
        role: "admin2",
        displayName: "admin2",
        lineUserId: "UWEB_ADMIN2",
      },
      1_000,
    );

    expect(verifySupportAdminToken(`${token}x`, 2_000)).toBeNull();
    expect(verifySupportAdminToken(token ?? undefined, 50_000_000)).toBeNull();
  });

  it("uses server-only support passwords in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPPORT_ADMIN_PASSWORD", "server-password");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PASSWORD", "public-password");

    expect(getSupportAdminCredentials("admin")?.password).toBe("server-password");
  });
});
