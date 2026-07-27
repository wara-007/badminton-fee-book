import { describe, expect, it } from "vitest";
import { createSupportTicketUrl } from "@/lib/support-ticket-url";

describe("support ticket URL", () => {
  it("opens the requested ticket on the support inbox", () => {
    expect(
      createSupportTicketUrl(
        "123e4567-e89b-12d3-a456-426614174000",
        "https://example.com",
      ),
    ).toBe(
      "https://example.com/support?ticket=123e4567-e89b-12d3-a456-426614174000",
    );
  });
});
