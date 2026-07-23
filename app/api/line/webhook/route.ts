import { createClient } from "@supabase/supabase-js";
import {
  LineWebhookEvent,
  getLineGroupIds,
  verifyLineWebhookSignature,
} from "@/lib/line-webhook";

export const dynamic = "force-dynamic";

async function loadLineGroupName(groupId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  const response = await fetch(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;

  const result = await response.json() as { groupName?: string };
  return typeof result.groupName === "string" ? result.groupName : null;
}

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const rawBody = await request.text();
  if (!channelSecret) {
    return Response.json({ error: "LINE webhook is not configured" }, { status: 503 });
  }
  if (!verifyLineWebhookSignature(
    rawBody,
    request.headers.get("x-line-signature"),
    channelSecret,
  )) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { events?: LineWebhookEvent[] };
  try {
    payload = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const groupIds = getLineGroupIds(Array.isArray(payload.events) ? payload.events : []);
  if (groupIds.length === 0) {
    return Response.json({ ok: true, groupsStored: 0 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return Response.json({ error: "LINE group storage is not configured" }, { status: 503 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const groupId of groupIds) {
    const groupName = await loadLineGroupName(groupId);
    const { error } = await client.from("badminton_line_settings").upsert({
      id: true,
      recipient_id: groupId,
      recipient_type: "group",
      group_name: groupName,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Failed to store LINE group destination", error);
      return Response.json({ error: "Store group destination failed" }, { status: 503 });
    }
  }

  return Response.json({ ok: true, groupsStored: groupIds.length });
}
