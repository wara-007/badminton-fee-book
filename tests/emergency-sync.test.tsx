import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "@/lib/session";

const remoteSession: SessionState = {
  players: [],
  pricing: { baseFee: 100, shuttleFee: 25 },
  currentShuttleNumber: 1,
  plannedMatches: [],
  activityLog: [],
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const supabaseMock = {
  loadRemoteSession: vi.fn(),
  saveRemoteSession: vi.fn(),
  loadRemoteNow: vi.fn(),
  subscribeRemoteSession: vi.fn(),
  loadPaymentAccountSetting: vi.fn(),
  subscribePaymentSettings: vi.fn()
};

describe("Emergency continue mode", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/supabase-session");
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("badminton-fee-book.auth", JSON.stringify({ role: "admin" }));
    window.history.pushState(null, "", "/?room=main");
    supabaseMock.loadRemoteSession.mockReset();
    supabaseMock.saveRemoteSession.mockReset();
    supabaseMock.loadRemoteNow.mockReset();
    supabaseMock.subscribeRemoteSession.mockReset();
    supabaseMock.loadPaymentAccountSetting.mockReset();
    supabaseMock.subscribePaymentSettings.mockReset();
    supabaseMock.loadRemoteSession.mockResolvedValue(remoteSession);
    supabaseMock.saveRemoteSession.mockResolvedValue(undefined);
    supabaseMock.loadRemoteNow.mockResolvedValue("2026-05-25T00:00:00.000Z");
    supabaseMock.subscribeRemoteSession.mockReturnValue(() => undefined);
    supabaseMock.loadPaymentAccountSetting.mockResolvedValue("gsb");
    supabaseMock.subscribePaymentSettings.mockReturnValue(() => undefined);
  });

  it("keeps working locally and stores a pending snapshot when Supabase save fails", async () => {
    const user = userEvent.setup();
    supabaseMock.saveRemoteSession.mockRejectedValue(new Error("offline"));

    await renderHomePage();

    await user.type(await screen.findByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    expect(await screen.findByText("รอส่งขึ้นเซิร์ฟเวอร์")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument();

    const localSnapshot = localStorage.getItem("badminton-fee-book.session.main");
    const pendingSnapshot = localStorage.getItem("badminton-fee-book.pending-sync.main");
    expect(localSnapshot).toContain('"name":"A"');
    expect(pendingSnapshot).toContain('"name":"A"');
  });

  it("does not overwrite pending local changes when an automatic refresh runs", async () => {
    const user = userEvent.setup();
    supabaseMock.saveRemoteSession.mockRejectedValue(new Error("offline"));

    await renderHomePage();

    await user.type(await screen.findByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await screen.findByText("รอส่งขึ้นเซิร์ฟเวอร์");

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument());
    expect(supabaseMock.loadRemoteSession).toHaveBeenCalledTimes(1);
  });

  it("exports the latest local state as JSON while sync is pending", async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const createObjectUrlSpy = vi
      .spyOn(window.URL, "createObjectURL")
      .mockReturnValue("blob:emergency-backup");
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => undefined);
    supabaseMock.saveRemoteSession.mockRejectedValue(new Error("offline"));

    await renderHomePage();

    await user.type(await screen.findByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await screen.findByText("รอส่งขึ้นเซิร์ฟเวอร์");
    await user.click(screen.getByRole("button", { name: "Export JSON ตอนนี้" }));

    expect(clickSpy).toHaveBeenCalled();
    const backupBlob = createObjectUrlSpy.mock.calls[0][0] as Blob;
    const backupText = await readBlobText(backupBlob);
    expect(backupText).toContain('"type": "emergency-session-backup"');
    expect(backupText).toContain('"name": "A"');
  });

  it("retries the pending snapshot and clears emergency status after success", async () => {
    const user = userEvent.setup();
    supabaseMock.saveRemoteSession.mockRejectedValueOnce(new Error("offline"));

    await renderHomePage();

    await user.type(await screen.findByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await screen.findByText("รอส่งขึ้นเซิร์ฟเวอร์");

    supabaseMock.saveRemoteSession.mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "ลองซิงก์ใหม่" }));

    await waitFor(() => expect(screen.getByText("ซิงก์แล้ว")).toBeInTheDocument());
    expect(localStorage.getItem("badminton-fee-book.pending-sync.main")).toBeNull();
  });
});

async function renderHomePage() {
  vi.resetModules();
  vi.doMock("@/lib/supabase-session", () => ({
    hasSupabaseConfig: true,
    loadRemoteSession: supabaseMock.loadRemoteSession,
    saveRemoteSession: supabaseMock.saveRemoteSession,
    loadRemoteNow: supabaseMock.loadRemoteNow,
    subscribeRemoteSession: supabaseMock.subscribeRemoteSession,
    loadPaymentAccountSetting: supabaseMock.loadPaymentAccountSetting,
    subscribePaymentSettings: supabaseMock.subscribePaymentSettings
  }));
  const { default: HomePage } = await import("@/app/page");
  render(<HomePage />);
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
