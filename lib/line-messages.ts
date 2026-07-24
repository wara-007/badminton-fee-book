import type { PaymentAccountId } from "@/lib/payment-accounts";

export type LineMessage =
  | { type: "text"; text: string }
  | {
      type: "image";
      originalContentUrl: string;
      previewImageUrl: string;
    }
  | {
      type: "flex";
      altText: string;
      contents: Record<string, unknown>;
    };

export type LinePlayerChoice = {
  id: string;
  name: string;
};

export function createPlayerChoiceMessage(options: {
  sessionId: string;
  players: LinePlayerChoice[];
}): LineMessage {
  const visiblePlayers = options.players.slice(0, 10);
  return {
    type: "flex",
    altText: `พบชื่อใกล้เคียง ${options.players.length} คน กรุณาเลือก`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `พบชื่อใกล้เคียง ${options.players.length} คน`,
            weight: "bold",
            size: "lg",
          },
          { type: "text", text: `รอบ ${options.sessionId}`, color: "#6B7280" },
          ...visiblePlayers.map((player) => ({
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: player.name.slice(0, 40),
              displayText: `ยอด ${player.name} ${options.sessionId}`,
              data: createLinePostbackData("balance", options.sessionId, player.id),
            },
          })),
          ...(options.players.length > visiblePlayers.length
            ? [{
                type: "text",
                text: "กรุณาพิมพ์ชื่อให้ละเอียดขึ้นเพื่อดูรายชื่อที่เหลือ",
                wrap: true,
                size: "sm",
                color: "#B45309",
              }]
            : []),
        ],
      },
    },
  };
}

export function createBalanceMessage(options: {
  sessionId: string;
  playerId: string;
  playerName: string;
  amount: number;
  shuttleCount: number;
  qrImageUrl: string;
  accountId: PaymentAccountId;
  accountLabel: string;
  recipientName: string;
}): LineMessage {
  const amountLabel = formatBaht(options.amount);
  return {
    type: "flex",
    altText: `${options.playerName} ยอด ${amountLabel} บาท รอบ ${options.sessionId}`,
    contents: {
      type: "bubble",
      size: "mega",
      hero: {
        type: "image",
        url: options.qrImageUrl,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "fit",
        backgroundColor: "#FFFFFF",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: options.playerName, weight: "bold", size: "xl" },
          { type: "text", text: `รอบ ${options.sessionId}`, color: "#6B7280" },
          {
            type: "text",
            text: `${amountLabel} บาท`,
            weight: "bold",
            size: "xxl",
            color: "#15803D",
          },
          {
            type: "text",
            text: `ค่าคอร์ทและลูกแบด ${options.shuttleCount} ลูก`,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: `${options.accountLabel} • ${options.recipientName}`,
            size: "sm",
            wrap: true,
            color: "#6B7280",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#15803D",
            action: {
              type: "postback",
              label: "ยืนยันว่าจ่ายแล้ว",
              displayText: `ยืนยันชำระ ${options.playerName}`,
              data: createLinePostbackData(
                "paid",
                options.sessionId,
                options.playerId,
                options.accountId,
              ),
            },
          },
        ],
      },
    },
  };
}

export function createAdminRequestMessage(options: {
  requestId: string;
  requesterName: string;
}): LineMessage {
  return {
    type: "flex",
    altText: `${options.requesterName} ขอเป็นแอดมิน`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "คำขอเป็นแอดมิน",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: options.requesterName,
            weight: "bold",
            size: "xl",
            wrap: true,
          },
          {
            type: "text",
            text: "ตรวจสอบว่าเป็นบุคคลที่ต้องการให้จัดการยอดและยืนยันการชำระเงินจริง",
            size: "sm",
            color: "#6B7280",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "ปฏิเสธ",
              displayText: `ปฏิเสธคำขอของ ${options.requesterName}`,
              data: createAdminReviewPostbackData("reject", options.requestId),
            },
          },
          {
            type: "button",
            style: "primary",
            color: "#15803D",
            action: {
              type: "postback",
              label: "อนุมัติ",
              displayText: `อนุมัติ ${options.requesterName} เป็นแอดมิน`,
              data: createAdminReviewPostbackData("approve", options.requestId),
            },
          },
        ],
      },
    },
  };
}

export function createLinePostbackData(
  action: "balance" | "paid",
  sessionId: string,
  playerId: string,
  accountId?: PaymentAccountId,
): string {
  const params = new URLSearchParams({
    a: action,
    r: sessionId,
    p: playerId,
  });
  if (accountId) params.set("ac", accountId);
  return params.toString();
}

export function parseLinePostbackData(value: string | undefined): {
  action: "balance" | "paid";
  sessionId: string;
  playerId: string;
  accountId?: PaymentAccountId;
} | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const action = params.get("a");
  const sessionId = params.get("r");
  const playerId = params.get("p");
  const accountId = params.get("ac");

  if (
    (action !== "balance" && action !== "paid") ||
    !sessionId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sessionId) ||
    !playerId
  ) {
    return null;
  }
  if (accountId && accountId !== "gsb" && accountId !== "kasikorn") {
    return null;
  }

  return {
    action,
    sessionId,
    playerId,
    accountId: accountId as PaymentAccountId | undefined,
  };
}

export function createAdminReviewPostbackData(
  decision: "approve" | "reject",
  requestId: string,
): string {
  return new URLSearchParams({
    a: "admin_review",
    d: decision,
    q: requestId,
  }).toString();
}

export function parseAdminReviewPostbackData(value: string | undefined): {
  decision: "approve" | "reject";
  requestId: string;
} | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const decision = params.get("d");
  const requestId = params.get("q");
  if (
    params.get("a") !== "admin_review" ||
    (decision !== "approve" && decision !== "reject") ||
    !requestId ||
    !/^[0-9a-f-]{36}$/i.test(requestId)
  ) {
    return null;
  }
  return { decision, requestId };
}

export function createSupportRequestMessage(options: {
  threadId: string;
  requesterName: string;
  message: string;
}): LineMessage {
  return {
    type: "flex",
    altText: `ข้อความใหม่จาก ${options.requesterName}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "ข้อความใหม่ถึงแอดมิน",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: options.requesterName,
            weight: "bold",
            size: "xl",
            wrap: true,
          },
          {
            type: "text",
            text: options.message.slice(0, 500),
            wrap: true,
            color: "#374151",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "ปิดเรื่อง",
              displayText: `ปิดเรื่องของ ${options.requesterName}`,
              data: createSupportPostbackData("close", options.threadId),
            },
          },
          {
            type: "button",
            style: "primary",
            color: "#2563EB",
            action: {
              type: "postback",
              label: "ตอบกลับ",
              displayText: `ตอบกลับ ${options.requesterName}`,
              data: createSupportPostbackData("reply", options.threadId),
            },
          },
        ],
      },
    },
  };
}

export function createSupportPostbackData(
  action: "reply" | "close",
  threadId: string,
): string {
  return new URLSearchParams({
    a: "support",
    d: action,
    q: threadId,
  }).toString();
}

export function parseSupportPostbackData(value: string | undefined): {
  action: "reply" | "close";
  threadId: string;
} | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const action = params.get("d");
  const threadId = params.get("q");
  if (
    params.get("a") !== "support" ||
    (action !== "reply" && action !== "close") ||
    !threadId ||
    !/^[0-9a-f-]{36}$/i.test(threadId)
  ) {
    return null;
  }
  return { action, threadId };
}

function formatBaht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(amount);
}
