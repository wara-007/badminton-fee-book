export function normalizePromptPayId(value: string): string {
  return value.replace(/\D/g, "");
}

export function buildPromptPayPayload(promptPayId: string, amount?: number): string {
  const normalizedId = normalizePromptPayId(promptPayId);
  const target =
    normalizedId.length === 10 && normalizedId.startsWith("0")
      ? `0066${normalizedId.slice(1)}`
      : normalizedId;
  const targetType = normalizedId.length === 13 ? "02" : "01";
  const merchantAccountInfo = [
    tlv("00", "A000000677010111"),
    tlv(targetType, target)
  ].join("");
  const amountTag =
    typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? tlv("54", amount.toFixed(2))
      : "";
  const payloadWithoutCrc = [
    tlv("00", "01"),
    tlv("01", amountTag ? "12" : "11"),
    tlv("29", merchantAccountInfo),
    tlv("53", "764"),
    amountTag,
    tlv("58", "TH"),
    "6304"
  ].join("");

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}

export function createPromptPayQrUrl(promptPayId: string, amount: number): string {
  const payload = buildPromptPayPayload(promptPayId, amount);
  return createQrImageUrl(payload);
}

export function createPromptPayQrUrlFromPayload(sourcePayload: string, amount: number): string {
  const payload = buildPromptPayPayloadFromExistingPayload(sourcePayload, amount);
  return createQrImageUrl(payload);
}

export function buildPromptPayPayloadFromExistingPayload(sourcePayload: string, amount: number): string {
  const payloadWithoutCrc = stripCrc(sourcePayload);
  const withoutAmount = removeTlv(payloadWithoutCrc, "54");
  const nextPayloadWithoutCrc = `${insertTlvBefore(withoutAmount, "58", tlv("54", amount.toFixed(2)))}6304`;

  return `${nextPayloadWithoutCrc}${crc16Ccitt(nextPayloadWithoutCrc)}`;
}

function createQrImageUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(payload)}`;
}

function stripCrc(payload: string): string {
  const crcIndex = payload.lastIndexOf("6304");
  return crcIndex >= 0 ? payload.slice(0, crcIndex) : payload;
}

function removeTlv(payload: string, targetId: string): string {
  let index = 0;
  let result = "";

  while (index + 4 <= payload.length) {
    const id = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    const end = index + 4 + length;
    if (!Number.isInteger(length) || length < 0 || end > payload.length) {
      return result + payload.slice(index);
    }
    if (id !== targetId) {
      result += payload.slice(index, end);
    }
    index = end;
  }

  return result;
}

function insertTlvBefore(payload: string, beforeId: string, insertedTag: string): string {
  let index = 0;
  let result = "";
  let inserted = false;

  while (index + 4 <= payload.length) {
    const id = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    const end = index + 4 + length;
    if (!Number.isInteger(length) || length < 0 || end > payload.length) {
      return `${result}${inserted ? "" : insertedTag}${payload.slice(index)}`;
    }
    if (!inserted && id === beforeId) {
      result += insertedTag;
      inserted = true;
    }
    result += payload.slice(index, end);
    index = end;
  }

  return inserted ? result : `${result}${insertedTag}`;
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}
