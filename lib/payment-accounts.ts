export type PaymentAccountId = "gsb" | "kasikorn";

export type PaymentAccount = {
  id: PaymentAccountId;
  label: string;
  bankName: string;
  recipientName: string;
  promptPayDisplay: string;
  logoSrc: string;
  payload: string;
};

export const DEFAULT_PAYMENT_ACCOUNT_ID: PaymentAccountId = "gsb";

export const PAYMENT_ACCOUNTS: PaymentAccount[] = [
  {
    id: "gsb",
    label: "บัญชีออมสิน",
    bankName: "ออมสิน",
    recipientName: "ว่าที่ ร.ต. ธนากร มาศิริ",
    promptPayDisplay: "089-081-0878",
    logoSrc: "/payment-accounts/gsb.png",
    payload:
      "00020101021129370016A0000006770101110113006689081087853037645802TH63042E3B"
  },
  {
    id: "kasikorn",
    label: "บัญชีกสิกร",
    bankName: "กสิกร",
    recipientName: "ว่าที่ ร.ต. ธนากร มาศิริ",
    promptPayDisplay: "004999095920004",
    logoSrc: "/payment-accounts/kasikorn.png",
    payload:
      "00020101021129390016A000000677010111031500499909592000453037645802TH630487C9"
  }
];

export function getPaymentAccount(accountId: string): PaymentAccount {
  return (
    PAYMENT_ACCOUNTS.find((account) => account.id === accountId) ??
    PAYMENT_ACCOUNTS.find((account) => account.id === DEFAULT_PAYMENT_ACCOUNT_ID) ??
    PAYMENT_ACCOUNTS[0]
  );
}

export function normalizePaymentAccountId(value: unknown): PaymentAccountId {
  return PAYMENT_ACCOUNTS.some((account) => account.id === value)
    ? (value as PaymentAccountId)
    : DEFAULT_PAYMENT_ACCOUNT_ID;
}

export function createEmptyReceivedByAccount(): Record<PaymentAccountId, number> {
  return PAYMENT_ACCOUNTS.reduce(
    (totals, account) => ({
      ...totals,
      [account.id]: 0
    }),
    {} as Record<PaymentAccountId, number>
  );
}

export function normalizeReceivedByAccount(
  value: unknown,
  fallbackReceivedAmount = 0
): Record<PaymentAccountId, number> {
  const totals = createEmptyReceivedByAccount();
  if (value && typeof value === "object") {
    PAYMENT_ACCOUNTS.forEach((account) => {
      const amount = Number((value as Record<string, unknown>)[account.id]);
      totals[account.id] = Number.isFinite(amount) && amount > 0 ? amount : 0;
    });
  }

  const hasAnyAccountAmount = Object.values(totals).some((amount) => amount > 0);
  if (!hasAnyAccountAmount && fallbackReceivedAmount > 0) {
    totals[DEFAULT_PAYMENT_ACCOUNT_ID] = fallbackReceivedAmount;
  }

  return totals;
}
