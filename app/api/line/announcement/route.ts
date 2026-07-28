import { createClient } from "@supabase/supabase-js";
import {
  createLineAnnouncementText,
  getLineAnnouncementSchedule,
} from "@/lib/line-announcement";
import { broadcastLineMessages, validateLineMessages } from "@/lib/line";

export const dynamic = "force-dynamic";

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
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

  const schedule = getLineAnnouncementSchedule(
    requestedDate ? `${requestedDate}T13:00:00+07:00` : undefined,
  );
  if (!schedule.isAnnouncementDay && !requestedDate) {
    return Response.json({
      ok: true,
      date: schedule.dateKey,
      status: "not-scheduled",
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json(
      { error: "LINE announcement is not configured" },
      { status: 503 },
    );
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const imageUrl = new URL("/line-announcement.jpg", request.url);
  const previewImageUrl = new URL(
    "/line-announcement-preview.jpg",
    request.url,
  );
  imageUrl.searchParams.set("v", schedule.dateKey);
  previewImageUrl.searchParams.set("v", schedule.dateKey);
  const messages = [
    {
      type: "image" as const,
      originalContentUrl: imageUrl.toString(),
      previewImageUrl: previewImageUrl.toString(),
    },
    {
      type: "text" as const,
      text: createLineAnnouncementText(
        schedule.thaiWeekday || "วันแบดมินตัน",
      ),
    },
  ];
  const validation = await validateLineMessages(messages);
  if (!validation.valid) {
    console.error("Invalid LINE announcement payload", validation.detail);
    return Response.json(
      { error: "รูปแบบประกาศ LINE ไม่ถูกต้อง", detail: validation.detail },
      { status: 503 },
    );
  }

  const { error: claimError } = await client
    .from("badminton_line_announcements")
    .insert({
      announcement_date: schedule.dateKey,
      recipient_id: "broadcast",
    });
  if (claimError?.code === "23505") {
    return Response.json({
      ok: true,
      date: schedule.dateKey,
      status: "already-sent",
    });
  }
  if (claimError) throw claimError;

  try {
    await broadcastLineMessages(messages);
  } catch (error) {
    await client
      .from("badminton_line_announcements")
      .delete()
      .eq("announcement_date", schedule.dateKey);
    console.error("LINE announcement failed", error);
    return Response.json({ error: "ส่งประกาศ LINE ไม่สำเร็จ" }, { status: 503 });
  }

  return Response.json({
    ok: true,
    date: schedule.dateKey,
    status: "sent",
  });
}
