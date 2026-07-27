import { cookies } from "next/headers";
import {
  SUPPORT_ADMIN_COOKIE,
  SUPPORT_ADMIN_SESSION_SECONDS,
  createSupportAdminToken,
  getSupportAdminCredentials,
  verifySupportAdminToken,
} from "@/lib/support-admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = verifySupportAdminToken(
    cookies().get(SUPPORT_ADMIN_COOKIE)?.value,
  );
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({
    authenticated: true,
    admin: { role: session.role, displayName: session.displayName },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = body?.username?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const credentials = getSupportAdminCredentials(username);
  if (!credentials || password !== credentials.password) {
    return Response.json(
      { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 },
    );
  }

  const token = createSupportAdminToken(credentials.session);
  if (!token) {
    return Response.json(
      { error: "ระบบ session แอดมินยังตั้งค่าไม่ครบ" },
      { status: 503 },
    );
  }
  cookies().set(SUPPORT_ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPPORT_ADMIN_SESSION_SECONDS,
  });
  return Response.json({
    authenticated: true,
    admin: {
      role: credentials.session.role,
      displayName: credentials.session.displayName,
    },
  });
}

export async function DELETE() {
  cookies().set(SUPPORT_ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
