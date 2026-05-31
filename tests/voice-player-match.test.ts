import { describe, expect, it } from "vitest";
import { matchSpokenPlayerNames } from "@/lib/voice-player-match";

const players = [
  { id: "a", name: "เอ" },
  { id: "b", name: "บอย" },
  { id: "c", name: "บอล" },
  { id: "d", name: "David" }
];

describe("voice player matching", () => {
  it("matches one spoken player name exactly", () => {
    expect(matchSpokenPlayerNames("เอ", players)).toEqual([
      { status: "matched", player: players[0] }
    ]);
  });

  it("matches multiple spoken player names in order", () => {
    expect(matchSpokenPlayerNames("เอ David", players)).toEqual([
      { status: "matched", player: players[0] },
      { status: "matched", player: players[3] }
    ]);
  });

  it("returns candidates instead of selecting an ambiguous partial name", () => {
    expect(matchSpokenPlayerNames("บ", players)).toEqual([
      { status: "ambiguous", spokenText: "บ", candidates: [players[1], players[2]] }
    ]);
  });

  it("returns unmatched text when no player name is close", () => {
    expect(matchSpokenPlayerNames("ไม่มี", players)).toEqual([
      { status: "unmatched", spokenText: "ไม่มี" }
    ]);
  });
});
