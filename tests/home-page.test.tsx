import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

describe("Badminton fee book page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("badminton-fee-book.auth", JSON.stringify({ role: "admin" }));
    delete (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  it("requires login and limits admin2 to paid actions", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    localStorage.setItem(
      "badminton-fee-book.session.main",
      JSON.stringify({
        players: [
          {
            id: "player-a",
            name: "A",
            shuttleCount: 1,
            shuttleMarks: [1],
            paid: false,
            waitingSince: new Date().toISOString()
          }
        ],
        pricing: { baseFee: 100, shuttleFee: 25 },
        currentShuttleNumber: 1,
        activityLog: [],
        updatedAt: new Date().toISOString()
      })
    );

    render(<HomePage />);

    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("ชื่อผู้ใช้"), "admin2");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "admin2");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    const row = await screen.findByRole("row", { name: /A/ });
    expect(screen.getByRole("button", { name: "เพิ่มผู้เล่น" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "ติ๊กลูกให้ A" })).toBeDisabled();
    expect(within(row).getByRole("checkbox", { name: "A ช่องที่ 1 ลูก 1" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "ลบ A" })).toBeDisabled();
    expect(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" })).not.toBeDisabled();

    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));
    await waitFor(() => expect(screen.getByText("ยืนยันการจ่ายเงิน")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "จ่ายแล้ว" }));

    expect(screen.getByText("จ่ายแล้ว 125 บาท")).toBeInTheDocument();
  });

  it("logs in as admin and keeps the current room from the URL", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    window.history.pushState(null, "", "/?room=2026-05-25");

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้ใช้"), "admin");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "admin");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(await screen.findByText("รอบ 2026-05-25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เพิ่มผู้เล่น" })).not.toBeDisabled();
  });

  it("adds a player, ticks shuttle cells, recalculates totals, and marks paid", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 1" }));
    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "2");
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 2" }));

    expect(within(row).getByLabelText("A จำนวนลูก 2")).toBeInTheDocument();
    expect(within(row).getByText("150")).toBeInTheDocument();
    expect(screen.getByText("ยอดรวม 125 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 125 บาท")).toBeInTheDocument();

    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));
    await user.click(screen.getByRole("button", { name: "จ่ายแล้ว" }));

    expect(screen.getByText("ยอดรวม 0 บาท")).toBeInTheDocument();
    expect(screen.getByText("จ่ายแล้ว 125 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 0 บาท")).toBeInTheDocument();
  });

  it("prevents duplicate player names", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), " a ");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    await waitFor(() => expect(screen.getByText("ชื่อซ้ำ")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "รับทราบ" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ชื่อซ้ำ" })).not.toBeInTheDocument());
    await user.clear(screen.getByLabelText("ชื่อผู้เล่น"));
    expect(screen.getByRole("button", { name: "เพิ่มผู้เล่น" })).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /A/ })).toHaveLength(1);
  });

  it("toggles the compact mobile summary group", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    expect(screen.getByText("0 ลูก")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ดูสรุปทั้งหมด/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ดูสรุปทั้งหมด/ }));

    expect(screen.getByRole("button", { name: /ซ่อนสรุป/ })).toBeInTheDocument();
  });

  it("shows the app version in the footer", () => {
    render(<HomePage />);

    expect(screen.getByText("v1.4.0")).toBeInTheDocument();
  });

  it("groups the shuttle picker by initial and shows an alphabetical index", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "badminton-fee-book.session.main",
      JSON.stringify({
        players: [
          { id: "jane", name: "Jane", shuttleCount: 0, shuttleMarks: [], paid: false },
          { id: "kai", name: "ไก่", shuttleCount: 0, shuttleMarks: [], paid: false },
          { id: "golf", name: "กอล์ฟ", shuttleCount: 0, shuttleMarks: [], paid: false },
          { id: "joy", name: "จอย", shuttleCount: 0, shuttleMarks: [], paid: false },
          { id: "zeta", name: "ซีต้า", shuttleCount: 0, shuttleMarks: [], paid: false },
          { id: "number", name: "99", shuttleCount: 0, shuttleMarks: [], paid: false }
        ],
        pricing: { baseFee: 100, shuttleFee: 25 },
        currentShuttleNumber: 1,
        updatedAt: new Date().toISOString()
      })
    );

    render(<HomePage />);
    await user.click(await screen.findByRole("button", { name: "เรียงตามอักษร" }));

    const index = screen.getByRole("navigation", { name: "ดัชนีรายชื่อตามอักษร" });
    expect(within(index).getByRole("button", { name: "ไปที่หมวด ก" })).toBeInTheDocument();
    expect(within(index).getByRole("button", { name: "ไปที่หมวด จ" })).toBeInTheDocument();
    expect(within(index).getByRole("button", { name: "ไปที่หมวด ซ" })).toBeInTheDocument();
    expect(within(index).queryByRole("button", { name: "ไปที่หมวด สระ" })).not.toBeInTheDocument();
    expect(within(index).queryByRole("button", { name: "ไปที่หมวด 0-9" })).not.toBeInTheDocument();
    expect(within(index).getByRole("button", { name: "ไปที่หมวด J" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "หมวด ก" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "หมวด ซ" })).toBeInTheDocument();
  });

  it("ticks the next shuttle slot when clicking a player name", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    expect(screen.queryByLabelText("แก้ชื่อ A")).not.toBeInTheDocument();

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("button", { name: "ติ๊กลูกให้ A" }));
    await user.click(within(row).getByRole("button", { name: "ติ๊กลูกให้ A" }));

    expect(within(row).getByRole("checkbox", { name: "A ช่องที่ 1 ลูก 1" })).toBeChecked();
    expect(within(row).getByRole("checkbox", { name: "A ช่องที่ 2 ลูก 1" })).toBeChecked();
    expect(within(row).getByLabelText("A จำนวนลูก 2")).toBeInTheDocument();
  });

  it("colors player rows by waiting time after signup and rest time", async () => {
    const now = Date.now();
    localStorage.setItem(
      "badminton-fee-book.session.main",
      JSON.stringify({
        players: [
          {
            id: "warning",
            name: "Warning",
            shuttleCount: 0,
            shuttleMarks: [],
            paid: false,
            waitingSince: new Date(now - 16 * 60 * 1000).toISOString()
          },
          {
            id: "danger",
            name: "Danger",
            shuttleCount: 0,
            shuttleMarks: [],
            paid: false,
            waitingSince: new Date(now - 21 * 60 * 1000).toISOString()
          },
          {
            id: "resting",
            name: "Resting",
            shuttleCount: 0,
            shuttleMarks: [],
            paid: false,
            waitingSince: new Date(now - 60 * 60 * 1000).toISOString(),
            restUntil: new Date(now + 5 * 60 * 1000).toISOString()
          }
        ],
        pricing: { baseFee: 100, shuttleFee: 25 },
        currentShuttleNumber: 1,
        updatedAt: new Date(now).toISOString()
      })
    );

    render(<HomePage />);

    expect(await screen.findByRole("row", { name: /Warning/ })).toHaveClass("waitingWarningRow");
    expect(screen.getByRole("row", { name: /Danger/ })).toHaveClass("waitingDangerRow");
    expect(screen.getByRole("row", { name: /Resting/ })).not.toHaveClass("waitingWarningRow");
    expect(screen.getByRole("row", { name: /Resting/ })).not.toHaveClass("waitingDangerRow");
  });

  it("starts a rest period for confirmed players before counting waiting time again", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("badminton-fee-book.session.main") ?? "{}");
      expect(stored.players).toHaveLength(4);
      stored.players.forEach((player: { restUntil?: string; waitingSince?: string }) => {
        expect(player.restUntil).toEqual(expect.any(String));
        expect(player.waitingSince).toBe(player.restUntil);
        expect(new Date(player.restUntil ?? 0).getTime()).toBeGreaterThan(Date.now());
      });
    });

    for (const name of ["A", "B", "C", "D"]) {
      expect(screen.getByRole("row", { name: new RegExp(name) })).not.toHaveClass(
        "waitingWarningRow"
      );
      expect(screen.getByRole("row", { name: new RegExp(name) })).not.toHaveClass(
        "waitingDangerRow"
      );
    }
  });

  it("shows priority players and recent activity after marking a shuttle", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const now = Date.now();
    localStorage.setItem(
      "badminton-fee-book.session.main",
      JSON.stringify({
        players: [
          {
            id: "a",
            name: "A",
            shuttleCount: 0,
            shuttleMarks: [],
            paid: false,
            waitingSince: new Date(now - 21 * 60 * 1000).toISOString()
          },
          {
            id: "b",
            name: "B",
            shuttleCount: 0,
            shuttleMarks: [],
            paid: false,
            waitingSince: new Date(now).toISOString()
          }
        ],
        pricing: { baseFee: 100, shuttleFee: 25 },
        currentShuttleNumber: 1,
        activityLog: [],
        updatedAt: new Date(now).toISOString()
      })
    );

    render(<HomePage />);

    expect(await screen.findByText("ควรจัดก่อน")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "คนที่ควรได้ลงก่อน" })).toHaveTextContent("A");

    await user.click(
      within(screen.getByRole("row", { name: /B/ })).getByRole("button", {
        name: "ติ๊กลูกให้ B"
      })
    );

    expect(screen.getByRole("region", { name: "ประวัติการแก้ไขล่าสุด" })).toHaveTextContent(
      "ติ๊ก B ลงลูก 1"
    );
  });

  it("warns when the checked shuttle marks are not complete sets of four", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    await user.click(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A ช่องที่ 1"
      })
    );
    await user.click(
      within(screen.getByRole("row", { name: /B/ })).getByRole("checkbox", {
        name: "B ช่องที่ 1"
      })
    );

    expect(screen.getByText("ลูกที่ 1 ยังไม่ครบ 4 ติ๊ก เหลืออีก 2 ติ๊ก")).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("row", { name: /C/ })).getByRole("checkbox", {
        name: "C ช่องที่ 1"
      })
    );
    await user.click(
      within(screen.getByRole("row", { name: /D/ })).getByRole("checkbox", {
        name: "D ช่องที่ 1"
      })
    );

    expect(screen.queryByText(/ยังไม่ครบ 4 ติ๊ก/)).not.toBeInTheDocument();
  });

  it("keeps ten shuttle columns by default and expands after a player fills the last slot", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    expect(screen.getByRole("checkbox", { name: "A ช่องที่ 10" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "A ช่องที่ 11" })).not.toBeInTheDocument();

    const row = screen.getByRole("row", { name: /A/ });
    for (let markIndex = 1; markIndex <= 10; markIndex += 1) {
      await user.clear(screen.getByLabelText("ลูก number"));
      await user.type(screen.getByLabelText("ลูก number"), String(markIndex));
      await user.click(within(row).getByRole("button", { name: "ติ๊กลูกให้ A" }));
    }

    expect(screen.getByRole("checkbox", { name: "A ช่องที่ 11" })).toBeInTheDocument();
  });

  it("does not expand shuttle columns from the current shuttle number alone", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "24");

    expect(screen.getByLabelText("ลูก number")).toHaveValue(24);
    expect(screen.getByRole("checkbox", { name: "A ช่องที่ 10" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "A ช่องที่ 24" })).not.toBeInTheDocument();
  });

  it("shows the names already picked for the current shuttle", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }

    expect(screen.getByText("กำลังเลือกลูก 1")).toBeInTheDocument();
    expect(screen.getByText("A, B, C")).toBeInTheDocument();
    expect(screen.getByText("3/4 เหลืออีก 1 ติ๊ก")).toBeInTheDocument();
  });

  it("keeps the current shuttle number when editing an older shuttle mark", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "7");

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }
    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ยืนยัน Match" })).not.toBeInTheDocument());

    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "24");
    await user.click(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A ช่องที่ 1 ลูก 7"
      })
    );
    await waitFor(() => expect(screen.getByText("เอาติ๊กออก")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "เอาออก" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "เอาติ๊กออก" })).not.toBeInTheDocument());

    expect(screen.getByLabelText("ลูก number")).toHaveValue(7);
    expect(screen.getByText("ลูกที่ 7 ยังไม่ครบ 4 ติ๊ก เหลืออีก 1 ติ๊ก")).toBeInTheDocument();
    expect(screen.getByText("กำลังเลือกลูก 7")).toBeInTheDocument();
    expect(screen.getByText("B, C, D")).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("row", { name: /A/ })).getByRole("button", {
        name: "ติ๊กลูกให้ A"
      })
    );

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ยืนยัน Match" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("ลูก number")).toHaveValue(24);
    expect(screen.getByRole("checkbox", { name: "A ช่องที่ 1 ลูก 7" })).toBeChecked();
    expect(screen.getByText("กำลังเลือกลูก 24")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีชื่อที่ติ๊ก")).toBeInTheDocument();
  });

  it("locks other actions while an older shuttle edit is incomplete", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D", "E"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "7");

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }
    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ยืนยัน Match" })).not.toBeInTheDocument());

    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "24");
    await user.click(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A ช่องที่ 1 ลูก 7"
      })
    );
    await waitFor(() => expect(screen.getByText("เอาติ๊กออก")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "เอาออก" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "เอาติ๊กออก" })).not.toBeInTheDocument());

    expect(screen.getByText("กำลังแก้ลูกนี้ให้ครบก่อน จึงทำรายการอื่นได้")).toBeInTheDocument();
    expect(screen.getByLabelText("ลูก number")).toBeDisabled();
    expect(screen.getByRole("button", { name: "เพิ่มลูก number" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "เพิ่มผู้เล่น" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Match/ })).toBeDisabled();
    expect(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A จ่ายแล้ว"
      })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "ลบ A" })).toBeDisabled();
    expect(
      within(screen.getByRole("row", { name: /E/ })).getByRole("button", {
        name: "ติ๊กลูกให้ E"
      })
    ).not.toBeDisabled();

    await user.click(
      within(screen.getByRole("row", { name: /E/ })).getByRole("button", {
        name: "ติ๊กลูกให้ E"
      })
    );
    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ยืนยัน Match" })).not.toBeInTheDocument());

    expect(screen.getByLabelText("ลูก number")).not.toBeDisabled();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(24);
    expect(screen.getByRole("tab", { name: /Match/ })).not.toBeDisabled();
  });

  it("advances the current shuttle number after four players are checked on the same shuttle", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    expect(screen.getByLabelText("ลูก number")).toHaveValue(1);

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(screen.getByLabelText("ลูก number")).toHaveValue(2);
  });

  it("warns in the completion confirmation when at least three players overlap with a previous match", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D", "E"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    for (const name of ["A", "B", "C", "E"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("เตือน: ซ้ำกับลูกที่ 1 จำนวน 3 คน: A, B, C")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(screen.getByLabelText("ลูก number")).toHaveValue(3);
  });

  it("does not save the latest mark when cancelling an overlapping match confirmation", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D", "E"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    for (const name of ["A", "B", "C", "E"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("เตือน: ซ้ำกับลูกที่ 1 จำนวน 3 คน: A, B, C")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(within(screen.getByRole("row", { name: /E/ })).getByRole("checkbox", {
      name: "E ช่องที่ 1"
    })).not.toBeChecked();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(2);
  });

  it("removes a checked shuttle mark after a complete shuttle advances", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(screen.getByLabelText("ลูก number")).toHaveValue(2);

    await user.click(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A ช่องที่ 1 ลูก 1"
      })
    );

    await waitFor(() => expect(screen.getByText("เอาติ๊กออก")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "เอาออก" }));
    expect(
      within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
        name: "A ช่องที่ 1"
      })
    ).not.toBeChecked();
    expect(screen.getByText("ลูกที่ 1 ยังไม่ครบ 4 ติ๊ก เหลืออีก 1 ติ๊ก")).toBeInTheDocument();
  });

  it("allows each shuttle number to be marked independently per player", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D", "E", "F"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    await waitFor(() => expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));

    for (const name of ["A", "C"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    for (const name of ["E", "F"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    const eRow = screen.getByRole("row", { name: /E/ });
    expect(within(eRow).getByRole("checkbox", { name: "E ช่องที่ 1 ลูก 2" })).toBeChecked();
    expect(within(eRow).getByRole("checkbox", { name: "E ช่องที่ 2" })).not.toBeChecked();
    expect(within(eRow).getByLabelText("E จำนวนลูก 1")).toBeInTheDocument();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(3);
  });

  it("advances after four checked marks even when the same player has the same shuttle number twice", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["A", "B", "C", "D", "E", "F"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["A", "B", "C", "D"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    for (const name of ["A", "C", "E", "F"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    for (const name of ["A", "B", "C"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 3`
        })
      );
    }

    await user.click(
      within(screen.getByRole("row", { name: /B/ })).getByRole("checkbox", {
        name: "B ช่องที่ 4"
      })
    );

    expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument();
    expect(screen.getByText("เตือน: ซ้ำกับลูกที่ 1 จำนวน 3 คน: A, B, C")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(screen.getByLabelText("ลูก number")).toHaveValue(4);
  });

  it("shows a match tab grouped by shuttle number", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["a", "b", "c", "d", "e", "f"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["a", "b", "c", "d"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    for (const name of ["a", "c", "e", "f"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    for (const name of ["a", "b", "c"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 3`
        })
      );
    }

    await user.click(
      within(screen.getByRole("row", { name: /b/ })).getByRole("checkbox", {
        name: "b ช่องที่ 4"
      })
    );

    expect(screen.getByText("ยืนยัน Match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    await user.click(screen.getByRole("tab", { name: /Match/ }));

    const matchSummary = screen.getByRole("region", { name: "รายการ Match" });
    expect(within(matchSummary).getByText("ลูกที่ 1")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b c d")).toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 2")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a c e f")).toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 3")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b b c")).toBeInTheDocument();
  });

  it("marks match rows and checked shuttle buttons when a shuttle has more than four names", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "badminton-fee-book.session.main",
      JSON.stringify({
        players: ["a", "b", "c", "d", "e"].map((name, index) => ({
          id: `${index}`,
          name,
          shuttleCount: 1,
          shuttleMarks: [1],
          paid: false
        })),
        pricing: { baseFee: 100, shuttleFee: 25 },
        currentShuttleNumber: 1,
        updatedAt: "2026-05-25T00:00:00.000Z"
      })
    );

    render(<HomePage />);

    await screen.findByRole("row", { name: /a/ });

    await user.click(screen.getByRole("tab", { name: /Match/ }));

    const matchSummary = screen.getByRole("region", { name: "รายการ Match" });
    expect(within(matchSummary).getByText("ลูกที่ 1")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b c d e (5/4 เกิน)")).toBeInTheDocument();
    expect(within(matchSummary).queryByText("ลูกที่ 1 ชุด 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /กำลังตี/ }));

    expect(
      within(screen.getByRole("row", { name: /a/ }))
        .getByRole("checkbox", { name: "a ช่องที่ 1 ลูก 1" })
        .parentElement?.querySelector(".shuttleNumberIcon")
    ).toHaveClass("shuttleNumberIconDanger");
  });

  it("marks incomplete match rows and checked shuttle buttons with a warning color", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["a", "b", "c"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }

    await user.click(screen.getByRole("tab", { name: /Match/ }));

    const matchSummary = screen.getByRole("region", { name: "รายการ Match" });
    expect(within(matchSummary).getByText("a b c (3/4 ยังไม่ครบ)")).toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 1").closest(".matchItem")).toHaveClass(
      "matchItemWarning"
    );

    await user.click(screen.getByRole("tab", { name: /กำลังตี/ }));

    expect(
      within(screen.getByRole("row", { name: /a/ }))
        .getByRole("checkbox", { name: "a ช่องที่ 1 ลูก 1" })
        .parentElement?.querySelector(".shuttleNumberIcon")
    ).toHaveClass("shuttleNumberIconWarning");
  });

  it("prevents adding a fifth mark to the same shuttle number", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["a", "b", "c", "d", "e"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["a", "b", "c", "d"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("button", {
          name: `ติ๊กลูกให้ ${name}`
        })
      );
    }

    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "1");
    await user.click(
      within(screen.getByRole("row", { name: /e/ })).getByRole("button", {
        name: "ติ๊กลูกให้ e"
      })
    );

    expect(alertSpy).toHaveBeenCalledWith("ลูกที่ 1 ครบ 4 ติ๊กแล้ว ถ้าจะเปลี่ยนให้เอาออกก่อน");
    expect(within(screen.getByRole("row", { name: /e/ })).getByLabelText("e จำนวนลูก 0")).toBeInTheDocument();
  });

  it("filters match rows by player name", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HomePage />);

    for (const name of ["a", "b", "c", "d", "e", "f"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    for (const name of ["a", "b", "c", "d"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 1`
        })
      );
    }

    for (const name of ["a", "c", "e", "f"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 2`
        })
      );
    }

    for (const name of ["a", "b", "c"]) {
      await user.click(
        within(screen.getByRole("row", { name: new RegExp(name) })).getByRole("checkbox", {
          name: `${name} ช่องที่ 3`
        })
      );
    }

    await user.click(
      within(screen.getByRole("row", { name: /b/ })).getByRole("checkbox", {
        name: "b ช่องที่ 4"
      })
    );
    await user.click(screen.getByRole("tab", { name: /Match/ }));
    await user.type(screen.getByLabelText("ค้นหา Match"), "b");

    const matchSummary = screen.getByRole("region", { name: "รายการ Match" });
    expect(within(matchSummary).getByText("ลูกที่ 1")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b c d")).toBeInTheDocument();
    expect(within(matchSummary).queryByText("ลูกที่ 2")).not.toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 3")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b b c")).toBeInTheDocument();
  });

  it("confirms before removing a checked shuttle mark", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    const shuttleOne = within(row).getByRole("checkbox", { name: "A ช่องที่ 1" });
    await user.click(shuttleOne);
    await user.click(shuttleOne);

    await waitFor(() => expect(screen.getByText("เอาติ๊กออก")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(shuttleOne).toBeChecked();
  });

  it("asks for confirmation before marking a player paid", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    await waitFor(() => expect(screen.getByText("ยืนยันการจ่ายเงิน")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" })).not.toBeChecked();
  });

  it("asks for confirmation before deleting a player", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("button", { name: "ลบ A" }));

    await waitFor(() => expect(screen.getByText("ลบผู้เล่น")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument();
  });

  it("clears play data while keeping players", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 1" }));
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    await user.click(screen.getByRole("tab", { name: /สรุปจ่ายแล้ว/ }));
    await user.click(screen.getByRole("button", { name: "ล้างข้อมูลเล่น" }));

    await waitFor(() => expect(screen.getByText("ล้างข้อมูลเล่น")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ล้างข้อมูล" }));
    expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
      name: "A ช่องที่ 1"
    })).not.toBeChecked();
    expect(screen.getByText("ยอดรวม 100 บาท")).toBeInTheDocument();
    expect(screen.getByText("จ่ายแล้ว 0 บาท")).toBeInTheDocument();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(1);
  });

  it("moves paid players out of the active sheet and into the paid summary tab", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 1" }));
    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "2");
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 2" }));
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));
    await waitFor(() => expect(screen.getByText("ยืนยันการจ่ายเงิน")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "จ่ายแล้ว" }));

    expect(screen.queryByRole("row", { name: /A/ })).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีผู้เล่นค้างจ่าย")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /สรุปจ่ายแล้ว/ }));

    const paidSummary = screen.getByRole("region", { name: "รายการจ่ายแล้ว" });
    expect(screen.getByRole("heading", { name: "สรุปจ่ายแล้ว" })).toBeInTheDocument();
    expect(within(paidSummary).getByText("A")).toBeInTheDocument();
    expect(within(paidSummary).getByText("2 ลูก")).toBeInTheDocument();
    expect(within(paidSummary).getByText("125 บาท")).toBeInTheDocument();
    expect(within(paidSummary).getByText("150 บาท")).toBeInTheDocument();
  });

  it("persists session data to localStorage and restores it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "B");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.clear(screen.getByLabelText("ค่าเริ่มต้น"));
    await user.type(screen.getByLabelText("ค่าเริ่มต้น"), "120");
    await user.clear(screen.getByLabelText("ลูก number"));
    await user.type(screen.getByLabelText("ลูก number"), "5");

    unmount();
    render(<HomePage />);

    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(5);
    expect(screen.getByRole("row", { name: /B/ })).toBeInTheDocument();
  });

  it("filters active players by name from the search field", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ann");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ben");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    await user.type(screen.getByLabelText("ค้นหาชื่อ"), "ann");

    expect(screen.getByRole("row", { name: /Ann/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Ben/ })).not.toBeInTheDocument();
  });

  it("filters paid players by name in the paid summary tab", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ann");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ben");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    await user.click(within(screen.getByRole("row", { name: /Ann/ })).getByRole("checkbox", { name: "Ann จ่ายแล้ว" }));
    await user.click(within(screen.getByRole("row", { name: /Ben/ })).getByRole("checkbox", { name: "Ben จ่ายแล้ว" }));
    await user.type(screen.getByLabelText("ค้นหาชื่อ"), "ben");
    await user.click(screen.getByRole("tab", { name: /สรุปจ่ายแล้ว/ }));

    const paidSummary = screen.getByRole("region", { name: "รายการจ่ายแล้ว" });
    expect(within(paidSummary).getByText("Ben")).toBeInTheDocument();
    expect(within(paidSummary).queryByText("Ann")).not.toBeInTheDocument();
  });

  it("asks for confirmation before resetting the session", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "C");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("tab", { name: /สรุปจ่ายแล้ว/ }));
    await user.click(screen.getByRole("button", { name: "รีเซ็ตรอบ" }));

    await waitFor(() => expect(screen.getByText("รีเซ็ตรอบ")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    await user.click(screen.getByRole("tab", { name: /กำลังตี/ }));
    expect(screen.getByRole("row", { name: /C/ })).toBeInTheDocument();
  });

  it("adds multiple available players to a planned match from one voice transcript", async () => {
    const user = userEvent.setup();
    const recognition = installSpeechRecognitionMock();

    render(<HomePage />);

    for (const name of ["Ann", "Ben", "Cat"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    await user.click(screen.getByRole("tab", { name: "จัด Match ล่วงหน้า" }));
    await user.click(screen.getByRole("button", { name: /Match 1/ }));
    await user.click(screen.getByRole("button", { name: "เลือกผู้เล่นด้วยเสียง" }));
    act(() => recognition.emitResult("Ann Ben"));

    expect(await screen.findByText("1. Ann")).toBeInTheDocument();
    expect(screen.getByText("2. Ben")).toBeInTheDocument();
    expect(screen.getByText("ได้ยิน: Ann Ben")).toBeInTheDocument();
  });

  it("shows candidate buttons instead of selecting an ambiguous spoken name", async () => {
    const user = userEvent.setup();
    const recognition = installSpeechRecognitionMock();

    render(<HomePage />);

    for (const name of ["Boy", "Ball"]) {
      await user.type(screen.getByLabelText("ชื่อผู้เล่น"), name);
      await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    }

    await user.click(screen.getByRole("tab", { name: "จัด Match ล่วงหน้า" }));
    await user.click(screen.getByRole("button", { name: /Match 1/ }));
    await user.click(screen.getByRole("button", { name: "เลือกผู้เล่นด้วยเสียง" }));
    act(() => recognition.emitResult("B"));

    const candidatePrompt = await screen.findByText("เลือกชื่อที่ได้ยินว่า “b”");
    const candidateBox = candidatePrompt.parentElement;
    expect(candidateBox).not.toBeNull();
    expect(within(candidateBox as HTMLElement).getByRole("button", { name: "Boy" })).toBeInTheDocument();
    expect(within(candidateBox as HTMLElement).getByRole("button", { name: "Ball" })).toBeInTheDocument();
    expect(screen.queryByText("1. Boy")).not.toBeInTheDocument();
  });

  it("shows a microphone permission error without breaking manual selection", async () => {
    const user = userEvent.setup();
    const recognition = installSpeechRecognitionMock();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ann");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("tab", { name: "จัด Match ล่วงหน้า" }));
    await user.click(screen.getByRole("button", { name: /Match 1/ }));
    await user.click(screen.getByRole("button", { name: "เลือกผู้เล่นด้วยเสียง" }));
    act(() => recognition.emitError("not-allowed"));

    expect(await screen.findByText("ไม่ได้รับสิทธิ์ใช้ไมโครโฟน")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ann" }));
    expect(screen.getByText("1. Ann")).toBeInTheDocument();
  });

  it("disables voice selection when the browser does not support speech recognition", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "Ann");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("tab", { name: "จัด Match ล่วงหน้า" }));
    await user.click(screen.getByRole("button", { name: /Match 1/ }));

    expect(screen.getByRole("button", { name: "เลือกผู้เล่นด้วยเสียง" })).toBeDisabled();
  });
});

function installSpeechRecognitionMock() {
  class SpeechRecognitionMock {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    start = vi.fn();
    stop = vi.fn();

    emitResult(transcript: string) {
      this.onresult?.({ results: [{ 0: { transcript } }] });
    }

    emitError(error: string) {
      this.onerror?.({ error });
    }
  }

  const recognition = new SpeechRecognitionMock();
  (window as typeof window & { SpeechRecognition: new () => SpeechRecognitionMock }).SpeechRecognition =
    class {
      constructor() {
        return recognition;
      }
    } as new () => SpeechRecognitionMock;

  return recognition;
}
