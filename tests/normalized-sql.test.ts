import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/normalized-schema.sql", "utf8");
const archive = readFileSync("supabase/archive-existing-normalized.sql", "utf8");
const migration = readFileSync("supabase/migrate-legacy-sessions.sql", "utf8");
const rpcs = readFileSync("supabase/normalized-rpcs.sql", "utf8");
const client = readFileSync("lib/supabase-session.ts", "utf8");

describe("normalized storage SQL contract", () => {
  it("scopes players and player relations to their room", () => {
    expect(schema).toContain("primary key (room_id, id)");
    expect(schema).toContain("references public.badminton_players(room_id, id)");
    expect(schema).toContain("foreign key (room_id, match_id)");
  });

  it("copies legacy player order and revision without modifying legacy sessions", () => {
    expect(migration).toContain("player.ordinality::integer");
    expect(migration).toContain("revision,");
    expect(migration).not.toMatch(/update public\.badminton_sessions|delete from public\.badminton_sessions/i);
  });

  it("archives an earlier normalized rollout before creating the cutover schema", () => {
    expect(archive).toContain("create schema if not exists badminton_normalized_archive");
    expect(archive).toContain("alter table public.%I set schema badminton_normalized_archive");
  });

  it("keeps client RPC names and parameters aligned", () => {
    expect(rpcs).toContain("function public.load_normalized_badminton_session(p_id text)");
    expect(rpcs).toContain("function public.save_normalized_badminton_session(");
    expect(rpcs).toContain("function public.delete_normalized_badminton_room(p_room_id text)");
    expect(client).toContain("rpc('load_normalized_badminton_session'");
    expect(client).toContain("rpc('save_normalized_badminton_session'");
    expect(client).toContain("rpc('delete_normalized_badminton_room', {\n    p_room_id: sessionId");
    expect(rpcs).toContain("if result is null then raise exception 'Room not found'; end if;");
  });

  it("stores dashboard snapshots separately from live rooms", () => {
    expect(schema).toContain("create table if not exists public.badminton_room_dashboard_snapshots");
    expect(schema).toContain("room_id text primary key");
    expect(schema).toContain("received_by_account jsonb not null default");
    expect(schema).not.toMatch(
      /badminton_room_dashboard_snapshots[\s\S]*references public\.badminton_rooms\(id\) on delete cascade/i
    );
    expect(rpcs).toContain("function public.upsert_badminton_room_dashboard_snapshot(");
    expect(rpcs).toContain("p_received_by_account jsonb");
    expect(rpcs).toContain("'received_by_account', snapshot.received_by_account");
    expect(rpcs).toContain("function public.list_badminton_room_dashboard_snapshots()");
    expect(client).toContain("rpc('upsert_badminton_room_dashboard_snapshot'");
    expect(client).toContain("rpc('list_badminton_room_dashboard_snapshots'");
  });

  it("stores the selected PromptPay account as shared Supabase settings", () => {
    expect(schema).toContain("create table if not exists public.badminton_payment_settings");
    expect(schema).toContain("selected_account_id text not null default 'gsb'");
    expect(rpcs).toContain("function public.get_badminton_payment_settings()");
    expect(rpcs).toContain("function public.set_badminton_payment_account(p_selected_account_id text)");
    expect(client).toContain("rpc('get_badminton_payment_settings'");
    expect(client).toContain("rpc('set_badminton_payment_account'");
  });

  it("persists which payment account was used for paid players", () => {
    expect(schema).toContain("paid_account_id text check (paid_account_id in ('gsb', 'kasikorn'))");
    expect(rpcs).toContain("'paidAccountId', coalesce(player.paid_account_id, 'gsb')");
    expect(rpcs).toContain("paid_account_id");
  });

  it("persists activity needed for match source and start-time status", () => {
    expect(schema).toContain("create table if not exists public.badminton_match_events");
    expect(migration).toContain("insert into public.badminton_match_events");
    expect(rpcs).toContain("'activityLog', coalesce((");
    expect(rpcs).toContain("insert into public.badminton_match_events");
    expect(rpcs).toContain("where element->>'action' in ('mark-added','match-confirmed')");
    expect(migration).toContain("where activity.value->>'action' in ('mark-added', 'match-confirmed')");
    expect(rpcs).not.toContain("'activityLog', '[]'::jsonb");
  });
});
