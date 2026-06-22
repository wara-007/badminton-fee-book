import { describe, expect, it } from "vitest";
import {
  buildPromptPayPayload,
  buildPromptPayPayloadFromExistingPayload,
  createPromptPayQrUrl,
  createPromptPayQrUrlFromPayload,
  normalizePromptPayId
} from "@/lib/promptpay";
import {
  PAYMENT_ACCOUNTS,
  getPaymentAccount,
  normalizeReceivedByAccount
} from "@/lib/payment-accounts";

describe("PromptPay QR helpers", () => {
  it("normalizes PromptPay IDs before building QR payloads", () => {
    expect(normalizePromptPayId("081-234-5678")).toBe("0812345678");
  });

  it("builds a fixed amount PromptPay payload", () => {
    const payload = buildPromptPayPayload("0812345678", 125);

    expect(payload).toContain("000201");
    expect(payload).toContain("010212");
    expect(payload).toContain("5303764");
    expect(payload).toContain("5406125.00");
    expect(payload).toContain("5802TH");
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("creates a QR image URL from the generated payload", () => {
    const url = createPromptPayQrUrl("0812345678", 125);

    expect(url).toContain("https://api.qrserver.com/v1/create-qr-code/");
    expect(decodeURIComponent(url)).toContain("5406125.00");
  });

  it("reuses an existing PromptPay payload and replaces the amount", () => {
    const sourcePayload = buildPromptPayPayload("0812345678", 20);
    const nextPayload = buildPromptPayPayloadFromExistingPayload(sourcePayload, 125);
    const url = createPromptPayQrUrlFromPayload(sourcePayload, 125);

    expect(nextPayload).toContain("5406125.00");
    expect(nextPayload).not.toContain("540520.00");
    expect(nextPayload).toMatch(/6304[0-9A-F]{4}$/);
    expect(decodeURIComponent(url)).toContain("5406125.00");
  });

  it("keeps both selectable payment accounts available for QR generation", () => {
    expect(PAYMENT_ACCOUNTS.map((account) => account.id)).toEqual([
      "gsb",
      "kasikorn"
    ]);
    expect(PAYMENT_ACCOUNTS.every((account) => account.logoSrc.startsWith("/payment-accounts/"))).toBe(true);
    expect(getPaymentAccount("gsb").promptPayDisplay).toBe("089-081-0878");
    expect(getPaymentAccount("kasikorn").promptPayDisplay).toBe("004999095920004");
    expect(createPromptPayQrUrlFromPayload(getPaymentAccount("kasikorn").payload, 125)).toContain(
      encodeURIComponent("5406125.00")
    );
  });

  it("defaults legacy received totals to the GSB account", () => {
    expect(normalizeReceivedByAccount(undefined, 250)).toEqual({
      gsb: 250,
      kasikorn: 0
    });
    expect(normalizeReceivedByAccount({ gsb: 100, kasikorn: 150 }, 250)).toEqual({
      gsb: 100,
      kasikorn: 150
    });
  });
});
