import { describe, expect, it } from "vitest";
import { mergeLineAdminRecipients } from "@/lib/line-admin-recipients";

describe("LINE admin recipients", () => {
  it("combines stored and configured admins without duplicates", () => {
    expect(
      mergeLineAdminRecipients(
        ["Ustored", "Cgroup", "Uduplicate"],
        "Uconfigured, Uduplicate",
        "Ulegacy",
      ),
    ).toEqual(["Ustored", "Uduplicate", "Uconfigured", "Ulegacy"]);
  });

  it("never includes group, room, or malformed recipients", () => {
    expect(
      mergeLineAdminRecipients(
        ["Cgroup", "Rroom", null],
        "Cgroup,Rroom",
        "Clegacy",
      ),
    ).toEqual([]);
  });
});
