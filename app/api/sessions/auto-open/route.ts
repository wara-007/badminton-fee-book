import { createClient } from "@supabase/supabase-js";
import { runAutoOpenSession } from "@/lib/auto-open-session";
import { sendLinePush } from "@/lib/line";
import { mergeLineAdminNotificationRecipients } from "@/lib/line-admin-recipients";
import { createInitialSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://badminton-fee-book.vercel.app";

function getProductionAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : DEFAULT_APP_URL)
  );
}

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function loadLineAdminRecipients(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return mergeLineAdminNotificationRecipients([], []);
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [
    { data: admins, error: adminError },
    { data: adminGroups, error: groupError },
  ] = await Promise.all([
    client
      .from("badminton_line_admins")
      .select("user_id")
      .eq("enabled", true),
    client
      .from("badminton_line_group_destinations")
      .select("group_id")
      .eq("group_type", "admin")
      .eq("enabled", true),
  ]);
  if (adminError) throw adminError;
  if (groupError) throw groupError;

  return mergeLineAdminNotificationRecipients(
    (admins ?? []).map((admin) => admin.user_id),
    (adminGroups ?? []).map((group) => group.group_id),
  );
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
        if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
          return false;
        }

        const roomUrl = new URL("/", getProductionAppUrl());
        roomUrl.searchParams.set("room", sessionId);
        const recipients = await loadLineAdminRecipients();
        if (recipients.length === 0) return false;

        const deliveries = await Promise.allSettled(
          recipients.map((recipient) =>
            sendLinePush(
              `🏸 เปิดรอบ ${sessionId} แล้ว\n${roomUrl.toString()}`,
              recipient,
            ),
          ),
        );
        const deliveredCount = deliveries.filter(
          (delivery) => delivery.status === "fulfilled",
        ).length;
        deliveries.forEach((delivery, index) => {
          if (delivery.status === "rejected") {
            console.error(
              `Failed to notify LINE admin destination ${recipients[index]}`,
              delivery.reason,
            );
          }
        });
        return deliveredCount > 0;
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
