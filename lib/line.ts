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
