import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  LineWebhookEvent,
  findLinePlayerMatches,
  getLineGroupIds,
  getLinePublicMenuReply,
  isLineAdmin,
  isSetAdminGroupCommand,
  isUnsetAdminGroupCommand,
  parseLineBalanceCommand,
  verifyLineWebhookSignature,
} from "@/lib/line-webhook";
import {
  createAdminRequestMessage,
  createBalanceMessage,
  createPlayerChoiceMessage,
  createSupportRequestMessage,
  parseAdminReviewPostbackData,
  parseLinePostbackData,
  parseSupportPostbackData,
  type LineMessage,
} from "@/lib/line-messages";
import { sendLineMessages, sendLineReply } from "@/lib/line";
import { mergeLineAdminNotificationRecipients } from "@/lib/line-admin-recipients";
import {
  getPaymentAccount,
  normalizePaymentAccountId,
} from "@/lib/payment-accounts";
import { createPromptPayQrUrlFromPayload } from "@/lib/promptpay";

export const dynamic = "force-dynamic";

type RoomRow = {
  id: string;
  base_fee: number | string;
  shuttle_fee: number | string;
  closed_at: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  paid: boolean;
  paid_amount: number | string | null;
};

type LinePaymentRpcResult = {
  status?: "paid" | "already-paid" | "not-found" | "room-closed";
  player_name?: string;
  amount?: number | string;
};

type LineAdminReviewRpcResult = {
  status?: "approved" | "rejected" | "already-reviewed" | "not-found" | "forbidden";
  requester_user_id?: string;
  requester_display_name?: string;
};

type LineSupportThreadRow = {
  id: string;
  requester_user_id: string;
  requester_display_name: string;
  status: "open" | "answered" | "closed";
};

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

async function loadLineUserName(userId: string): Promise<string> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return "ผู้ใช้ LINE";

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return "ผู้ใช้ LINE";

  const result = await response.json() as { displayName?: string };
  return typeof result.displayName === "string" && result.displayName.trim()
    ? result.displayName.trim()
    : "ผู้ใช้ LINE";
}

async function storeLineGroups(
  client: SupabaseClient,
  groupIds: string[],
): Promise<void> {
  for (const groupId of groupIds) {
    const groupName = await loadLineGroupName(groupId);
    const { error } = await client.from("badminton_line_settings").upsert({
      id: true,
      recipient_id: groupId,
      recipient_type: "group",
      group_name: groupName,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

async function loadRoomPlayers(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ room: RoomRow | null; players: PlayerRow[] }> {
  const [{ data: room, error: roomError }, { data: players, error: playersError }] =
    await Promise.all([
      client
        .from("badminton_rooms")
        .select("id, base_fee, shuttle_fee, closed_at")
        .eq("id", sessionId)
        .maybeSingle(),
      client
        .from("badminton_players")
        .select("id, name, paid, paid_amount")
        .eq("room_id", sessionId)
        .order("position"),
    ]);
  if (roomError) throw roomError;
  if (playersError) throw playersError;

  return {
    room: room as RoomRow | null,
    players: (players ?? []) as PlayerRow[],
  };
}

async function createPlayerBalanceReply(
  client: SupabaseClient,
  sessionId: string,
  playerId: string,
): Promise<LineMessage> {
  const [{ data: room, error: roomError }, { data: player, error: playerError }] =
    await Promise.all([
      client
        .from("badminton_rooms")
        .select("id, base_fee, shuttle_fee, closed_at")
        .eq("id", sessionId)
        .maybeSingle(),
      client
        .from("badminton_players")
        .select("id, name, paid, paid_amount")
        .eq("room_id", sessionId)
        .eq("id", playerId)
        .maybeSingle(),
    ]);
  if (roomError) throw roomError;
  if (playerError) throw playerError;
  if (!room) return textMessage(`ไม่พบรอบ ${sessionId}`);
  if (!player) return textMessage(`ไม่พบรายชื่อนี้ในรอบ ${sessionId}`);

  const typedPlayer = player as PlayerRow;
  if (typedPlayer.paid) {
    const paidAmount = Number(typedPlayer.paid_amount) || 0;
    return textMessage(
      `✅ ${typedPlayer.name} ชำระแล้ว\nรอบ ${sessionId}\nจำนวน ${formatBaht(paidAmount)} บาท`,
    );
  }

  const { count: shuttleCount, error: countError } = await client
    .from("badminton_shuttle_marks")
    .select("*", { count: "exact", head: true })
    .eq("room_id", sessionId)
    .eq("player_id", playerId);
  if (countError) throw countError;

  const typedRoom = room as RoomRow;
  const amount =
    Number(typedRoom.base_fee) +
    (shuttleCount ?? 0) * Number(typedRoom.shuttle_fee);
  const accountId = await loadPaymentAccountId(client);
  const account = getPaymentAccount(accountId);

  return createBalanceMessage({
    sessionId,
    playerId,
    playerName: typedPlayer.name,
    amount,
    shuttleCount: shuttleCount ?? 0,
    qrImageUrl: createPromptPayQrUrlFromPayload(account.payload, amount),
    accountId,
    accountLabel: account.label,
    recipientName: account.recipientName,
  });
}

async function loadPaymentAccountId(client: SupabaseClient) {
  const { data, error } = await client
    .from("badminton_payment_settings")
    .select("selected_account_id")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return normalizePaymentAccountId(data?.selected_account_id);
}

async function isAuthorizedLineAdmin(
  client: SupabaseClient,
  userId: string | undefined,
): Promise<boolean> {
  if (isLineAdmin(userId)) return true;
  if (!userId) return false;

  const { data, error } = await client
    .from("badminton_line_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function loadLineAdminNotificationRecipients(
  client: SupabaseClient,
): Promise<string[]> {
  const [{ data: admins, error: adminsError }, { data: groups, error: groupsError }] =
    await Promise.all([
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
  if (adminsError) throw adminsError;
  if (groupsError) throw groupsError;

  return mergeLineAdminNotificationRecipients(
    (admins ?? []).map((admin) => admin.user_id),
    (groups ?? []).map((group) => group.group_id),
  );
}

async function handlePendingAdminReply(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  const adminUserId = event.source?.userId;
  if (!adminUserId || !await isAuthorizedLineAdmin(client, adminUserId)) {
    return null;
  }

  const { data: replyState, error: stateError } = await client
    .from("badminton_line_support_reply_states")
    .select("thread_id, expires_at")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();
  if (stateError) throw stateError;
  if (!replyState) return null;

  if (new Date(replyState.expires_at).getTime() <= Date.now()) {
    await client
      .from("badminton_line_support_reply_states")
      .delete()
      .eq("admin_user_id", adminUserId);
    return textMessage("หมดเวลาตอบกลับแล้ว กรุณากดปุ่ม “ตอบกลับ” ใหม่");
  }

  if (text.trim() === "ยกเลิกตอบ") {
    const { error } = await client
      .from("badminton_line_support_reply_states")
      .delete()
      .eq("admin_user_id", adminUserId);
    if (error) throw error;
    return textMessage("ยกเลิกการตอบกลับแล้ว");
  }
  if (!text.trim()) {
    return textMessage("กรุณาพิมพ์ข้อความที่ต้องการส่ง หรือพิมพ์ “ยกเลิกตอบ”");
  }

  const { data: thread, error: threadError } = await client
    .from("badminton_line_support_threads")
    .select("id, requester_user_id, requester_display_name, status")
    .eq("id", replyState.thread_id)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread || thread.status === "closed") {
    await client
      .from("badminton_line_support_reply_states")
      .delete()
      .eq("admin_user_id", adminUserId);
    return textMessage("เรื่องนี้ถูกปิดแล้ว");
  }

  const typedThread = thread as LineSupportThreadRow;
  await sendLineMessages(
    [textMessage(`แอดมินตอบ:\n${text.trim()}`)],
    typedThread.requester_user_id,
  );

  const [{ error: messageError }, { error: updateError }, { error: deleteError }] =
    await Promise.all([
      client.from("badminton_line_support_messages").insert({
        thread_id: typedThread.id,
        sender_type: "admin",
        sender_line_user_id: adminUserId,
        body: text.trim(),
      }),
      client
        .from("badminton_line_support_threads")
        .update({ status: "answered", updated_at: new Date().toISOString() })
        .eq("id", typedThread.id),
      client
        .from("badminton_line_support_reply_states")
        .delete()
        .eq("admin_user_id", adminUserId),
    ]);
  if (messageError) throw messageError;
  if (updateError) throw updateError;
  if (deleteError) throw deleteError;

  return textMessage(`✅ ส่งคำตอบให้ ${typedThread.requester_display_name} แล้ว`);
}

async function handleSupportRequest(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  const requesterUserId = event.source?.userId;
  if (
    event.source?.type !== "user" ||
    !requesterUserId ||
    await isAuthorizedLineAdmin(client, requesterUserId) ||
    !text.trim()
  ) {
    return null;
  }

  const requesterName = await loadLineUserName(requesterUserId);
  const { data: existingThread, error: existingError } = await client
    .from("badminton_line_support_threads")
    .select("id, requester_user_id, requester_display_name, status")
    .eq("requester_user_id", requesterUserId)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let thread = existingThread as LineSupportThreadRow | null;
  if (!thread) {
    const { data, error } = await client
      .from("badminton_line_support_threads")
      .insert({
        requester_user_id: requesterUserId,
        requester_display_name: requesterName,
        status: "open",
      })
      .select("id, requester_user_id, requester_display_name, status")
      .single();
    if (error) throw error;
    thread = data as LineSupportThreadRow;
  } else {
    const { error } = await client
      .from("badminton_line_support_threads")
      .update({
        requester_display_name: requesterName,
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);
    if (error) throw error;
  }

  const { error: messageError } = await client
    .from("badminton_line_support_messages")
    .insert({
      thread_id: thread.id,
      sender_type: "user",
      sender_line_user_id: requesterUserId,
      body: text.trim(),
    });
  if (messageError) throw messageError;

  const recipients = await loadLineAdminNotificationRecipients(client);
  const adminMessage = createSupportRequestMessage({
    threadId: thread.id,
    requesterName,
    message: text.trim(),
  });
  const deliveries = await Promise.allSettled(
    recipients.map((recipient) => sendLineMessages([adminMessage], recipient)),
  );
  if (
    recipients.length === 0 ||
    deliveries.every((result) => result.status === "rejected")
  ) {
    console.error("Failed to notify any LINE admin about support request");
  }

  return textMessage(
    "ได้รับข้อความแล้ว แอดมินจะตอบกลับผ่านแชตนี้\nกรุณารอสักครู่",
  );
}

async function handleSetAdminGroup(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  if (!isSetAdminGroupCommand(text)) return null;
  if (
    event.source?.type !== "group" ||
    !event.source.groupId?.startsWith("C")
  ) {
    return textMessage("กรุณาส่ง “ตั้งกลุ่มแอดมิน” ภายในกลุ่ม LINE ที่ต้องการ");
  }
  if (!await isAuthorizedLineAdmin(client, event.source.userId)) {
    return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
  }

  const groupName = await loadLineGroupName(event.source.groupId);
  const { error } = await client
    .from("badminton_line_group_destinations")
    .upsert({
      group_id: event.source.groupId,
      group_type: "admin",
      group_name: groupName,
      enabled: true,
      registered_by: event.source.userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;

  return textMessage(
    `✅ ตั้ง${groupName ? ` “${groupName}”` : "กลุ่มนี้"}เป็นกลุ่มแอดมินเรียบร้อยแล้ว`,
  );
}

async function handleUnsetAdminGroup(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  if (!isUnsetAdminGroupCommand(text)) return null;
  if (
    event.source?.type !== "group" ||
    !event.source.groupId?.startsWith("C")
  ) {
    return textMessage(
      "กรุณาส่ง “ยกเลิกกลุ่มแอดมิน” ภายในกลุ่ม LINE ที่ต้องการ",
    );
  }
  if (!await isAuthorizedLineAdmin(client, event.source.userId)) {
    return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
  }

  const { data, error } = await client
    .from("badminton_line_group_destinations")
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("group_id", event.source.groupId)
    .eq("group_type", "admin")
    .eq("enabled", true)
    .select("group_id")
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return textMessage("กลุ่มนี้ไม่ได้เป็นกลุ่มแอดมินอยู่แล้ว");
  }
  return textMessage("✅ ยกเลิกกลุ่มแอดมินเรียบร้อยแล้ว");
}

async function handleAdminRegistration(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  const match = text.trim().match(/^ตั้งแอดมิน\s+(\S+)$/u);
  if (!match) return null;
  if (event.source?.type !== "user" || !event.source.userId) {
    return textMessage("กรุณาส่งคำสั่งตั้งแอดมินในแชตส่วนตัวกับบอท");
  }

  const setupCode = process.env.LINE_ADMIN_SETUP_CODE;
  if (!setupCode || match[1] !== setupCode) {
    return textMessage("รหัสตั้งแอดมินไม่ถูกต้อง");
  }

  const { count, error: countError } = await client
    .from("badminton_line_admins")
    .select("*", { count: "exact", head: true })
    .eq("enabled", true);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    return textMessage("มีแอดมิน LINE ลงทะเบียนแล้ว");
  }

  const { error } = await client.from("badminton_line_admins").upsert({
    user_id: event.source.userId,
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return textMessage("✅ ลงทะเบียนเป็นแอดมินเรียบร้อยแล้ว");
}

async function handleAdminRequest(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  if (text.trim() !== "ขอเป็นแอดมิน") return null;
  if (event.source?.type !== "user" || !event.source.userId) {
    return textMessage("กรุณาส่ง “ขอเป็นแอดมิน” ในแชตส่วนตัวกับบอท");
  }
  if (await isAuthorizedLineAdmin(client, event.source.userId)) {
    return textMessage("คุณเป็นแอดมินอยู่แล้ว");
  }

  const { data: pending, error: pendingError } = await client
    .from("badminton_line_admin_requests")
    .select("id")
    .eq("requester_user_id", event.source.userId)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (pending) {
    return textMessage("คำขอของคุณกำลังรอแอดมินพิจารณา");
  }

  const requesterName = await loadLineUserName(event.source.userId);
  const { data: requestRow, error: requestError } = await client
    .from("badminton_line_admin_requests")
    .insert({
      requester_user_id: event.source.userId,
      requester_display_name: requesterName,
      status: "pending",
    })
    .select("id")
    .single();
  if (requestError) throw requestError;

  const { data: admins, error: adminError } = await client
    .from("badminton_line_admins")
    .select("user_id")
    .eq("enabled", true);
  if (adminError) throw adminError;
  if (!admins?.length) {
    await client
      .from("badminton_line_admin_requests")
      .delete()
      .eq("id", requestRow.id);
    return textMessage(
      "ยังไม่มีแอดมินสำหรับอนุมัติ กรุณาลงทะเบียนแอดมินคนแรกด้วยรหัสตั้งต้น",
    );
  }

  const approvalMessage = createAdminRequestMessage({
    requestId: String(requestRow.id),
    requesterName,
  });
  const deliveries = await Promise.allSettled(
    admins.map((admin) =>
      sendLineMessages([approvalMessage], String(admin.user_id)),
    ),
  );
  const delivered = deliveries.filter(
    (result) => result.status === "fulfilled",
  ).length;
  if (delivered === 0) {
    throw new Error("Failed to notify any LINE admin");
  }

  return textMessage("ส่งคำขอให้แอดมินพิจารณาแล้ว");
}

async function handleBalanceCommand(
  client: SupabaseClient,
  event: LineWebhookEvent,
  text: string,
): Promise<LineMessage | null> {
  const command = parseLineBalanceCommand(text);
  if (!command) return null;
  if (!await isAuthorizedLineAdmin(client, event.source?.userId)) {
    return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
  }

  const { room, players } = await loadRoomPlayers(client, command.sessionId);
  if (!room) return textMessage(`ไม่พบรอบ ${command.sessionId}`);

  const matches = findLinePlayerMatches(players, command.playerQuery);
  if (matches.length === 0) {
    return textMessage(
      `ไม่พบชื่อ “${command.playerQuery}” ในรอบ ${command.sessionId}`,
    );
  }
  if (matches.length > 1) {
    return createPlayerChoiceMessage({
      sessionId: command.sessionId,
      players: matches,
    });
  }

  return createPlayerBalanceReply(client, command.sessionId, matches[0].id);
}

async function handlePostback(
  client: SupabaseClient,
  event: LineWebhookEvent,
): Promise<LineMessage | null> {
  const support = parseSupportPostbackData(event.postback?.data);
  if (support) {
    const adminUserId = event.source?.userId;
    if (!adminUserId || !await isAuthorizedLineAdmin(client, adminUserId)) {
      return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
    }

    const { data: thread, error: threadError } = await client
      .from("badminton_line_support_threads")
      .select("id, requester_user_id, requester_display_name, status")
      .eq("id", support.threadId)
      .maybeSingle();
    if (threadError) throw threadError;
    if (!thread) return textMessage("ไม่พบเรื่องนี้");
    if (thread.status === "closed") return textMessage("เรื่องนี้ถูกปิดแล้ว");

    if (support.action === "close") {
      const [{ error: closeError }, { error: statesError }] = await Promise.all([
        client
          .from("badminton_line_support_threads")
          .update({
            status: "closed",
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", support.threadId),
        client
          .from("badminton_line_support_reply_states")
          .delete()
          .eq("thread_id", support.threadId),
      ]);
      if (closeError) throw closeError;
      if (statesError) throw statesError;
      return textMessage(`✅ ปิดเรื่องของ ${thread.requester_display_name} แล้ว`);
    }

    const { error: stateError } = await client
      .from("badminton_line_support_reply_states")
      .upsert({
        admin_user_id: adminUserId,
        thread_id: support.threadId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (stateError) throw stateError;
    return textMessage(
      `กำลังตอบ ${thread.requester_display_name}\n` +
      "พิมพ์ข้อความถัดไปเพื่อส่ง หรือพิมพ์ “ยกเลิกตอบ”",
    );
  }

  const adminReview = parseAdminReviewPostbackData(event.postback?.data);
  if (adminReview) {
    if (!await isAuthorizedLineAdmin(client, event.source?.userId)) {
      return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
    }

    const { data, error } = await client.rpc("review_line_admin_request", {
      p_request_id: adminReview.requestId,
      p_reviewer_user_id: event.source?.userId,
      p_approve: adminReview.decision === "approve",
    });
    if (error) throw error;

    const result = (data ?? {}) as LineAdminReviewRpcResult;
    if (result.status === "forbidden") {
      return textMessage("คุณไม่มีสิทธิ์พิจารณาคำขอนี้");
    }
    if (result.status === "not-found") {
      return textMessage("ไม่พบคำขอนี้");
    }
    if (result.status === "already-reviewed") {
      return textMessage("คำขอนี้ได้รับการพิจารณาไปแล้ว");
    }

    const approved = result.status === "approved";
    if (result.requester_user_id) {
      try {
        await sendLineMessages(
          [textMessage(
            approved
              ? "✅ คำขอเป็นแอดมินได้รับการอนุมัติแล้ว"
              : "คำขอเป็นแอดมินไม่ได้รับการอนุมัติ",
          )],
          result.requester_user_id,
        );
      } catch (error) {
        console.error("Failed to notify LINE admin requester", error);
      }
    }

    return textMessage(
      `${approved ? "✅ อนุมัติ" : "ปฏิเสธ"}คำขอของ ` +
      `${result.requester_display_name ?? "ผู้ใช้ LINE"} แล้ว`,
    );
  }

  const postback = parseLinePostbackData(event.postback?.data);
  if (!postback) return null;
  if (!await isAuthorizedLineAdmin(client, event.source?.userId)) {
    return textMessage("คำสั่งนี้ใช้ได้เฉพาะแอดมิน");
  }
  if (postback.action === "balance") {
    return createPlayerBalanceReply(
      client,
      postback.sessionId,
      postback.playerId,
    );
  }

  const { data, error } = await client.rpc(
    "mark_badminton_player_paid_from_line",
    {
      p_room_id: postback.sessionId,
      p_player_id: postback.playerId,
      p_paid_account_id: normalizePaymentAccountId(postback.accountId),
      p_line_admin_user_id: event.source?.userId,
    },
  );
  if (error) throw error;

  const result = (data ?? {}) as LinePaymentRpcResult;
  if (result.status === "not-found") {
    return textMessage(`ไม่พบรายการในรอบ ${postback.sessionId}`);
  }
  if (result.status === "room-closed") {
    return textMessage(`รอบ ${postback.sessionId} ปิดแล้ว จึงยังไม่แก้ไขสถานะ`);
  }

  const alreadyPaid = result.status === "already-paid";
  return textMessage(
    `${alreadyPaid ? "ℹ️ บันทึกไว้แล้ว" : "✅ บันทึกการชำระแล้ว"}\n` +
    `${result.player_name ?? "ผู้เล่น"}\n` +
    `รอบ ${postback.sessionId}\n` +
    `จำนวน ${formatBaht(Number(result.amount) || 0)} บาท`,
  );
}

async function processLineEvent(
  client: SupabaseClient,
  event: LineWebhookEvent,
): Promise<boolean> {
  if (!event.replyToken) return false;

  let reply: LineMessage | null = null;
  if (event.type === "message" && event.message?.type === "text") {
    const text = event.message.text ?? "";
    const publicMenuReply = getLinePublicMenuReply(text);
    reply =
      await handleUnsetAdminGroup(client, event, text) ??
      await handlePendingAdminReply(client, event, text) ??
      (publicMenuReply ? textMessage(publicMenuReply) : null) ??
      await handleSetAdminGroup(client, event, text) ??
      await handleAdminRequest(client, event, text) ??
      await handleAdminRegistration(client, event, text) ??
      await handleBalanceCommand(client, event, text) ??
      await handleSupportRequest(client, event, text);
  } else if (event.type === "postback") {
    reply = await handlePostback(client, event);
  }
  if (!reply) return false;

  await sendLineReply(event.replyToken, [reply]);
  return true;
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

  const events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) {
    return Response.json({ ok: true, groupsStored: 0, eventsHandled: 0 });
  }

  const client = createServiceClient();
  if (!client) {
    return Response.json({ error: "LINE data service is not configured" }, { status: 503 });
  }

  try {
    const groupIds = getLineGroupIds(events);
    await storeLineGroups(client, groupIds);

    let eventsHandled = 0;
    for (const event of events) {
      if (await processLineEvent(client, event)) eventsHandled += 1;
    }
    return Response.json({ ok: true, groupsStored: groupIds.length, eventsHandled });
  } catch (error) {
    console.error("LINE webhook processing failed", error);
    return Response.json({ error: "LINE webhook processing failed" }, { status: 503 });
  }
}

function textMessage(text: string): LineMessage {
  return { type: "text", text };
}

function formatBaht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(amount);
}
