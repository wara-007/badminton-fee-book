const DEFAULT_SUPPORT_APP_URL = "https://badminton-fee-book.vercel.app";

export function createSupportTicketUrl(
  threadId: string,
  configuredBaseUrl =
    process.env.SUPPORT_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : DEFAULT_SUPPORT_APP_URL),
): string {
  const url = new URL("/support", configuredBaseUrl);
  url.searchParams.set("ticket", threadId);
  return url.toString();
}
