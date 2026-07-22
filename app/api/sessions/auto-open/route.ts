import { createClient } from "@supabase/supabase-js";
import { runAutoOpenSession } from "@/lib/auto-open-session";
import { sendLinePush } from "@/lib/line";

export const dynamic = "force-dynamic";

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function createSessionIfMissing(sessionId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase auto-open is not configured");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.from("badminton_rooms").insert({ id: sessionId });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoOpenSession({
      createSession: createSessionIfMissing,
      notifySessionOpened: async (sessionId) => {
        const roomUrl = new URL("/", request.url);
        roomUrl.searchParams.set("room", sessionId);
        await sendLinePush(`เปิดรอบ ${sessionId} แล้ว\n${roomUrl.toString()}`);
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
