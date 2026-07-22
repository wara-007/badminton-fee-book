import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_DATABASE_LIMIT_BYTES,
  createDatabaseUsage,
} from "@/lib/database-usage";
import { sendLinePush } from "@/lib/line";

export const dynamic = "force-dynamic";

type UsageRpcResult = {
  used_bytes?: number | string;
};

function getLimitBytes(): number {
  const configuredMb = Number(process.env.SUPABASE_DATABASE_LIMIT_MB);
  return configuredMb > 0
    ? configuredMb * 1024 * 1024
    : DEFAULT_DATABASE_LIMIT_BYTES;
}

async function loadDatabaseUsage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Database monitoring is not configured");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("get_badminton_database_usage");
  if (error) throw error;

  const result = data as UsageRpcResult | null;
  return createDatabaseUsage(Number(result?.used_bytes), getLimitBytes());
}

export async function GET(request: Request) {
  const notify = new URL(request.url).searchParams.get("notify") === "1";
  if (notify) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const usage = await loadDatabaseUsage();
    let notified = false;

    if (notify && usage.level !== "normal") {
      const label = usage.level === "critical" ? "เร่งด่วน" : "ใกล้เต็ม";
      await sendLinePush(
        `Supabase ${label}: ฐานข้อมูลใช้ ${usage.percentUsed}% (${Math.round(usage.usedBytes / 1048576)} จาก ${Math.round(usage.limitBytes / 1048576)} MB)`,
      );
      notified = true;
    }

    return Response.json({ ...usage, notified }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Database usage check failed", error);
    return Response.json(
      { error: "ตรวจสอบพื้นที่ฐานข้อมูลไม่สำเร็จ" },
      { status: 503 },
    );
  }
}
