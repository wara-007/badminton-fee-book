import { sendLineMessages } from "@/lib/line";
import {
  createSupportServiceClient,
  getSupportAdminSession,
  unauthorizedSupportResponse,
  unavailableSupportResponse,
} from "@/lib/support-admin-server";

export const dynamic = "force-dynamic";

type ClaimResult = {
  status?: "claimed" | "already-claimed" | "busy" | "closed" | "not-found";
  admin_name?: string;
};

async function loadTicket(client: NonNullable<ReturnType<typeof createSupportServiceClient>>, ticketId: string) {
  return client
    .from("badminton_line_support_threads")
    .select(
      "id, requester_user_id, requester_display_name, status, assigned_admin_user_id, assigned_admin_display_name, created_at, updated_at",
    )
    .eq("id", ticketId)
    .maybeSingle();
}

export async function GET(
  _request: Request,
  { params }: { params: { ticketId: string } },
) {
  if (!getSupportAdminSession()) return unauthorizedSupportResponse();
  const client = createSupportServiceClient();
  if (!client) return unavailableSupportResponse();

  const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }] =
    await Promise.all([
      loadTicket(client, params.ticketId),
      client
        .from("badminton_line_support_messages")
        .select("id, sender_type, sender_line_user_id, body, created_at")
        .eq("thread_id", params.ticketId)
        .order("created_at", { ascending: true }),
    ]);
  if (ticketError || messagesError) {
    console.error("Failed to load support ticket", ticketError ?? messagesError);
    return Response.json({ error: "โหลด Ticket ไม่สำเร็จ" }, { status: 500 });
  }
  if (!ticket) {
    return Response.json({ error: "ไม่พบ Ticket" }, { status: 404 });
  }
  return Response.json({ ticket, messages: messages ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { ticketId: string } },
) {
  const admin = getSupportAdminSession();
  if (!admin) return unauthorizedSupportResponse();
  const client = createSupportServiceClient();
  if (!client) return unavailableSupportResponse();

  const body = (await request.json().catch(() => null)) as {
    action?: "claim" | "reply" | "close";
    message?: string;
  } | null;
  if (!body?.action) {
    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }

  if (body.action === "claim") {
    const { data, error } = await client.rpc("claim_line_support_thread", {
      p_thread_id: params.ticketId,
      p_admin_user_id: admin.lineUserId,
      p_admin_display_name: admin.displayName,
    });
    if (error) {
      console.error("Failed to claim support ticket", error);
      return Response.json({ error: "รับเรื่องไม่สำเร็จ" }, { status: 500 });
    }
    const result = (data ?? {}) as ClaimResult;
    if (result.status === "busy") {
      return Response.json(
        { error: `เรื่องนี้กำลังดูแลโดย ${result.admin_name ?? "แอดมินอีกคน"}` },
        { status: 409 },
      );
    }
    if (result.status === "closed" || result.status === "not-found") {
      return Response.json({ error: "Ticket นี้ปิดแล้วหรือไม่พบข้อมูล" }, { status: 409 });
    }
    return Response.json({ ok: true, status: result.status });
  }

  const { data: ticket, error: ticketError } = await loadTicket(
    client,
    params.ticketId,
  );
  if (ticketError) {
    console.error("Failed to load support ticket for action", ticketError);
    return Response.json({ error: "โหลด Ticket ไม่สำเร็จ" }, { status: 500 });
  }
  if (!ticket || ticket.status !== "open") {
    return Response.json({ error: "Ticket นี้ปิดแล้ว" }, { status: 409 });
  }
  if (
    ticket.assigned_admin_user_id &&
    ticket.assigned_admin_user_id !== admin.lineUserId
  ) {
    return Response.json(
      {
        error: `เรื่องนี้กำลังดูแลโดย ${
          ticket.assigned_admin_display_name ?? "แอดมินอีกคน"
        }`,
      },
      { status: 409 },
    );
  }

  if (body.action === "close") {
    const now = new Date().toISOString();
    const [{ error: closeError }, { error: stateError }] = await Promise.all([
      client
        .from("badminton_line_support_threads")
        .update({ status: "closed", closed_at: now, updated_at: now })
        .eq("id", params.ticketId)
        .eq("status", "open"),
      client
        .from("badminton_line_support_reply_states")
        .delete()
        .eq("thread_id", params.ticketId),
    ]);
    if (closeError || stateError) {
      console.error("Failed to close support ticket", closeError ?? stateError);
      return Response.json({ error: "ปิดเรื่องไม่สำเร็จ" }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  const message = body.message?.trim() ?? "";
  if (!message || message.length > 5000) {
    return Response.json(
      { error: "กรุณาพิมพ์ข้อความไม่เกิน 5,000 ตัวอักษร" },
      { status: 400 },
    );
  }
  if (ticket.assigned_admin_user_id !== admin.lineUserId) {
    return Response.json(
      { error: "กรุณากดรับเรื่องก่อนตอบลูกค้า" },
      { status: 409 },
    );
  }

  try {
    await sendLineMessages(
      [{ type: "text", text: `แอดมินตอบ:\n${message}` }],
      ticket.requester_user_id,
    );
  } catch (error) {
    console.error("Failed to send web support reply to LINE", error);
    return Response.json({ error: "ส่งข้อความผ่าน LINE ไม่สำเร็จ" }, { status: 503 });
  }

  const repliedAt = new Date().toISOString();
  const [{ error: messageError }, { error: updateError }] = await Promise.all([
    client.from("badminton_line_support_messages").insert({
      thread_id: params.ticketId,
      sender_type: "admin",
      sender_line_user_id: admin.lineUserId,
      body: message,
    }),
    client
      .from("badminton_line_support_threads")
      .update({ updated_at: repliedAt })
      .eq("id", params.ticketId)
      .eq("status", "open")
      .eq("assigned_admin_user_id", admin.lineUserId),
  ]);
  if (messageError || updateError) {
    console.error("Failed to save web support reply", messageError ?? updateError);
    return Response.json(
      { error: "ส่งถึงลูกค้าแล้ว แต่บันทึกประวัติไม่สำเร็จ" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true });
}
