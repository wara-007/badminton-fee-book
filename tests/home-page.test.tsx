import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

describe("Badminton fee book page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("adds a player, ticks shuttle cells, recalculates totals, and marks paid", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ลูกที่ 1" }));
    await user.click(within(row).getByRole("checkbox", { name: "A ลูกที่ 2" }));

    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("150")).toBeInTheDocument();
    expect(screen.getByText("ยอดรวม 150 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 150 บาท")).toBeInTheDocument();

    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    expect(screen.getByText("จ่ายแล้ว 150 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 0 บาท")).toBeInTheDocument();
  });

  it("moves paid players out of the active sheet and into the paid summary tab", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ลูกที่ 1" }));
    await user.click(within(row).getByRole("checkbox", { name: "A ลูกที่ 2" }));
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    expect(screen.queryByRole("row", { name: /A/ })).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีผู้เล่นค้างจ่าย")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /สรุปจ่ายแล้ว/ }));

    const paidSummary = screen.getByRole("region", { name: "รายการจ่ายแล้ว" });
    expect(screen.getByRole("heading", { name: "สรุปจ่ายแล้ว" })).toBeInTheDocument();
    expect(within(paidSummary).getByText("A")).toBeInTheDocument();
    expect(within(paidSummary).getByText("2 ลูก")).toBeInTheDocument();
    expect(within(paidSummary).getAllByText("150 บาท")).toHaveLength(2);
  });

  it("persists session data to localStorage and restores it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "B");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.clear(screen.getByLabelText("ค่าเริ่มต้น"));
    await user.type(screen.getByLabelText("ค่าเริ่มต้น"), "120");

    unmount();
    render(<HomePage />);

    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "C");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("button", { name: "รีเซ็ตรอบ" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("row", { name: /C/ })).toBeInTheDocument();
  });
});
