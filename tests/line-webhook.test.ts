import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  getLineGroupIds,
  verifyLineWebhookSignature,
} from "@/lib/line-webhook";

describe("LINE webhook", () => {
  it("verifies the exact raw request body", () => {
    const body = JSON.stringify({ destination: "Ubot", events: [] });
    const secret = "test-channel-secret";
    const signature = createHmac("sha256", secret).update(body).digest("base64");

    expect(verifyLineWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyLineWebhookSignature(`${body}\n`, signature, secret)).toBe(false);
    expect(verifyLineWebhookSignature(body, null, secret)).toBe(false);
  });

  it("extracts unique group IDs and ignores user sources", () => {
    expect(getLineGroupIds([
      { type: "join", source: { type: "group", groupId: "Cgroup-one" } },
      { type: "message", source: { type: "group", groupId: "Cgroup-one" } },
      { type: "message", source: { type: "group", groupId: "Cgroup-two" } },
      { type: "message", source: { type: "user" } },
    ])).toEqual(["Cgroup-one", "Cgroup-two"]);
  });
});
