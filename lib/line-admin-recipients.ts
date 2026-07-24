export function mergeLineAdminRecipients(
  storedUserIds: unknown[],
  configuredAdminIds = process.env.LINE_ADMIN_USER_IDS,
  legacyRecipient = process.env.LINE_ALERT_TO,
): string[] {
  const recipients = new Set<string>();

  for (const value of storedUserIds) {
    if (typeof value === "string" && value.startsWith("U")) {
      recipients.add(value);
    }
  }
  for (const value of (configuredAdminIds ?? "").split(",")) {
    const userId = value.trim();
    if (userId.startsWith("U")) recipients.add(userId);
  }
  if (legacyRecipient?.startsWith("U")) {
    recipients.add(legacyRecipient);
  }

  return Array.from(recipients);
}

export function mergeLineAdminNotificationRecipients(
  storedUserIds: unknown[],
  storedAdminGroupIds: unknown[],
  configuredAdminIds = process.env.LINE_ADMIN_USER_IDS,
  legacyRecipient = process.env.LINE_ALERT_TO,
): string[] {
  const recipients = new Set(
    mergeLineAdminRecipients(
      storedUserIds,
      configuredAdminIds,
      legacyRecipient,
    ),
  );

  for (const value of storedAdminGroupIds) {
    if (typeof value === "string" && value.startsWith("C")) {
      recipients.add(value);
    }
  }

  return Array.from(recipients);
}
