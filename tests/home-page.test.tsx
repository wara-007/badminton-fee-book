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
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    expect(screen.getByText("ยอดรวม 150 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 150 บาท")).toBeInTheDocument();

    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    expect(screen.getByText("ยอดรวม 0 บาท")).toBeInTheDocument();
    expect(screen.getByText("จ่ายแล้ว 150 บาท")).toBeInTheDocument();
    expect(screen.getByText("ค้างจ่าย 0 บาท")).toBeInTheDocument();
  });

  it("prevents duplicate player names", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), " a ");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    expect(alertSpy).toHaveBeenCalledWith("มีชื่อ A อยู่แล้ว");
    expect(screen.getAllByRole("row", { name: /A/ })).toHaveLength(1);
  });

  it("advances the current shuttle number after four players are checked on the same shuttle", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
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

    expect(confirmSpy).toHaveBeenCalledWith("ครบ 4 คนแล้ว ไปที่ลูก 2 ใช่ไหม?");
    expect(screen.getByLabelText("ลูก number")).toHaveValue(2);
  });

  it("allows each shuttle number to be marked independently per player", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
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

    confirmSpy.mockClear();

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

    expect(confirmSpy).toHaveBeenCalledWith("ครบ 4 คนแล้ว ไปที่ลูก 4 ใช่ไหม?");
    expect(screen.getByLabelText("ลูก number")).toHaveValue(4);
  });

  it("shows a match tab grouped by shuttle number", async () => {
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

    const matchSummary = screen.getByRole("region", { name: "รายการ Match" });
    expect(within(matchSummary).getByText("ลูกที่ 1")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b c d")).toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 2")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a c e f")).toBeInTheDocument();
    expect(within(matchSummary).getByText("ลูกที่ 3")).toBeInTheDocument();
    expect(within(matchSummary).getByText("a b b c")).toBeInTheDocument();
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    const shuttleOne = within(row).getByRole("checkbox", { name: "A ช่องที่ 1" });
    await user.click(shuttleOne);
    await user.click(shuttleOne);

    expect(confirmSpy).toHaveBeenCalledWith("เอาออกแน่นะอีแก่");
    expect(shuttleOne).toBeChecked();
  });

  it("asks for confirmation before marking a player paid", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));

    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    expect(confirmSpy).toHaveBeenCalledWith("ยืนยันว่า A จ่ายแล้วใช่ไหม?");
    expect(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" })).not.toBeChecked();
  });

  it("asks for confirmation before deleting a player", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    await user.click(screen.getByRole("button", { name: "ลบ A" }));

    expect(confirmSpy).toHaveBeenCalledWith("ลบ A ออกจากรอบนี้ใช่ไหม?");
    expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument();
  });

  it("clears play data while keeping players", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("ชื่อผู้เล่น"), "A");
    await user.click(screen.getByRole("button", { name: "เพิ่มผู้เล่น" }));
    const row = screen.getByRole("row", { name: /A/ });
    await user.click(within(row).getByRole("checkbox", { name: "A ช่องที่ 1" }));
    await user.click(within(row).getByRole("checkbox", { name: "A จ่ายแล้ว" }));

    await user.click(screen.getByRole("button", { name: "ล้างข้อมูลเล่น" }));

    expect(confirmSpy).toHaveBeenCalledWith("ล้างลูกที่ติ๊กและสถานะจ่ายแล้ว แต่เก็บรายชื่อไว้ใช่ไหม?");
    expect(screen.getByRole("row", { name: /A/ })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /A/ })).getByRole("checkbox", {
      name: "A ช่องที่ 1"
    })).not.toBeChecked();
    expect(screen.getByText("ยอดรวม 100 บาท")).toBeInTheDocument();
    expect(screen.getByText("จ่ายแล้ว 0 บาท")).toBeInTheDocument();
    expect(screen.getByLabelText("ลูก number")).toHaveValue(1);
  });

  it("moves paid players out of the active sheet and into the paid summary tab", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
