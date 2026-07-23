import { createClient } from "@supabase/supabase-js";
import { runAutoOpenSession } from "@/lib/auto-open-session";
import { sendLinePush } from "@/lib/line";
import { createInitialSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function loadLineRecipient(): Promise<string | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return undefined;

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("badminton_line_settings")
    .select("recipient_id")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;

  return typeof data?.recipient_id === "string" ? data.recipient_id : undefined;
}

async function createSessionIfMissing(sessionId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const developmentAnonKey =
    process.env.NODE_ENV !== "production"
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : undefined;
  const serverKey = serviceRoleKey ?? developmentAnonKey;
  if (!url || !serverKey) {
    throw new Error("Supabase auto-open is not configured");
  }

  const client = createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!serviceRoleKey) {
    const { data: existingRoom, error: loadError } = await client
      .from("badminton_rooms")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (existingRoom) return false;

    const { data, error } = await client.rpc("save_normalized_badminton_session", {
      p_id: sessionId,
      p_state: createInitialSession(),
      p_expected_revision: 0,
    });
    if (error) throw error;
    return Boolean((data as { saved?: boolean } | null)?.saved);
  }

  const { error } = await client.from("badminton_rooms").insert({ id: sessionId });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedDate = new URL(request.url).searchParams.get("date");
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return Response.json(
      { error: "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const result = await runAutoOpenSession({
      now: requestedDate ? `${requestedDate}T16:00:00+07:00` : undefined,
      allowUnscheduled: Boolean(requestedDate),
      createSession: createSessionIfMissing,
      notifySessionOpened: async (sessionId) => {
        const lineConfigured = Boolean(
          process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_ALERT_TO,
        );
        if (!lineConfigured && process.env.NODE_ENV !== "production") {
          return false;
        }

        const roomUrl = new URL("/", request.url);
        roomUrl.searchParams.set("room", sessionId);
        const recipient = await loadLineRecipient();
        await sendLinePush(
          `เปิดรอบ ${sessionId} แล้ว\n${roomUrl.toString()}`,
          recipient,
        );
        return true;
      },
    });

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Automatic session opening failed", error);
    return Response.json(
      { error: "เปิดรอบอัตโนมัติไม่สำเร็จ" },
      { status: 503 },
    );
  }
}
