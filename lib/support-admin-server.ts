import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  SUPPORT_ADMIN_COOKIE,
  verifySupportAdminToken,
  type SupportAdminSession,
} from "@/lib/support-admin-auth";

export function createSupportServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupportAdminSession(): SupportAdminSession | null {
  return verifySupportAdminToken(cookies().get(SUPPORT_ADMIN_COOKIE)?.value);
}

export function unauthorizedSupportResponse(): Response {
  return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
}

export function unavailableSupportResponse(): Response {
  return Response.json(
    { error: "ระบบกล่องข้อความยังตั้งค่าไม่ครบ" },
    { status: 503 },
  );
}
