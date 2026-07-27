import {
  createSupportServiceClient,
  getSupportAdminSession,
  unauthorizedSupportResponse,
  unavailableSupportResponse,
} from "@/lib/support-admin-server";

export const dynamic = "force-dynamic";

type ThreadRow = {
  id: string;
  requester_display_name: string;
  status: "open" | "closed";
  assigned_admin_user_id: string | null;
  assigned_admin_display_name: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  thread_id: string;
  sender_type: "user" | "admin";
  body: string;
  created_at: string;
};

export async function GET(request: Request) {
  if (!getSupportAdminSession()) return unauthorizedSupportResponse();
  const client = createSupportServiceClient();
  if (!client) return unavailableSupportResponse();

  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  let query = client
    .from("badminton_line_support_threads")
    .select(
      "id, requester_display_name, status, assigned_admin_user_id, assigned_admin_display_name, created_at, updated_at",
    )
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (search) {
    query = query.ilike("requester_display_name", `%${search}%`);
  }
  const { data: threadData, error: threadError } = await query;
  if (threadError) {
    console.error("Failed to load support tickets", threadError);
    return Response.json({ error: "โหลด Ticket ไม่สำเร็จ" }, { status: 500 });
  }
  const threads = (threadData ?? []) as ThreadRow[];
  if (threads.length === 0) {
    return Response.json({ tickets: [], counts: { all: 0, waiting: 0, assigned: 0, answered: 0 } });
  }

  const { data: messageData, error: messageError } = await client
    .from("badminton_line_support_messages")
    .select("thread_id, sender_type, body, created_at")
    .in("thread_id", threads.map((thread) => thread.id))
    .order("created_at", { ascending: true })
    .limit(5000);
  if (messageError) {
    console.error("Failed to load support summaries", messageError);
    return Response.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });
  }

  const grouped = new Map<string, MessageRow[]>();
  for (const message of (messageData ?? []) as MessageRow[]) {
    const messages = grouped.get(message.thread_id) ?? [];
    messages.push(message);
    grouped.set(message.thread_id, messages);
  }

  const tickets = threads.map((thread) => {
    const messages = grouped.get(thread.id) ?? [];
    const latest = messages.at(-1);
    let unread = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sender_type === "admin") break;
      unread += 1;
    }
    const inboxStatus =
      latest?.sender_type === "admin"
        ? "answered"
        : thread.assigned_admin_user_id
          ? "assigned"
          : "waiting";
    return {
      id: thread.id,
      name: thread.requester_display_name,
      preview: latest?.body ?? "ยังไม่มีข้อความ",
      latestAt: latest?.created_at ?? thread.updated_at,
      unread,
      inboxStatus,
      ownerId: thread.assigned_admin_user_id,
      ownerName: thread.assigned_admin_display_name,
      createdAt: thread.created_at,
    };
  });

  return Response.json({
    tickets,
    counts: {
      all: tickets.length,
      waiting: tickets.filter((ticket) => ticket.inboxStatus === "waiting").length,
      assigned: tickets.filter((ticket) => ticket.inboxStatus === "assigned").length,
      answered: tickets.filter((ticket) => ticket.inboxStatus === "answered").length,
    },
  });
}
