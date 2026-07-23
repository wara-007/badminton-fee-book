import { createHmac, timingSafeEqual } from "crypto";

export type LineWebhookEvent = {
  type?: string;
  source?: {
    type?: string;
    groupId?: string;
  };
};

export function verifyLineWebhookSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;

  const expected = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function getLineGroupIds(events: LineWebhookEvent[]): string[] {
  return Array.from(new Set(
    events
      .filter((event) => event.source?.type === "group")
      .map((event) => event.source?.groupId)
      .filter((groupId): groupId is string => Boolean(groupId?.startsWith("C"))),
  ));
}
