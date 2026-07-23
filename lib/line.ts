import type { LineMessage } from "@/lib/line-messages";

export async function sendLinePush(message: string, recipient?: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const target = recipient ?? process.env.LINE_ALERT_TO;
  if (!token || !target) {
    throw new Error("LINE alert is not configured");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: target,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE push failed with status ${response.status}`);
  }
}

export async function sendLineMessages(
  messages: LineMessage[],
  recipient: string,
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !recipient) {
    throw new Error("LINE push is not configured");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: recipient, messages }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE push failed with status ${response.status}: ${detail}`);
  }
}

export async function sendLineReply(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE reply is not configured");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE reply failed with status ${response.status}: ${detail}`);
  }
}
