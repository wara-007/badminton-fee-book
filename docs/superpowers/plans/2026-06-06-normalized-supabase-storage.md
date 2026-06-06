# Normalized Supabase Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace whole-room JSON persistence with normalized Supabase tables and transactional mutations without losing existing production rooms.

**Architecture:** Keep the existing `SessionState` UI model, but introduce a normalized Supabase repository that assembles the UI model from room, player, mark, planned-match, and activity rows. All writes use scoped transactional RPCs. Legacy JSON remains read-only backup and rollback source.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL, Vitest

---

### Task 1: Create Normalized Schema And Backup

**Files:**
- Create: `supabase/normalized-schema.sql`
- Test: Supabase SQL Editor / MCP queries

- [ ] Create `badminton_sessions_backup`, copy all legacy rows, and revoke anon access.
- [ ] Create normalized room, player, shuttle mark, planned match, planned match player, and activity tables.
- [ ] Add foreign keys, uniqueness constraints, indexes, timestamps, and RLS.
- [ ] Add read policies for anon and revoke direct write access.
- [ ] Apply the schema migration to production.
- [ ] Verify all normalized tables exist and backup room count equals legacy room count.

### Task 2: Migrate Legacy JSON Data

**Files:**
- Create: `supabase/migrate-legacy-sessions.sql`
- Create: `supabase/reconcile-normalized-sessions.sql`

- [ ] Write a transactional migration from every legacy JSON row into normalized tables.
- [ ] Preserve player UUIDs, duplicate shuttle marks, planned-match positions, activity IDs, pricing, current shuttle number, and closed status.
- [ ] Run migration against production.
- [ ] Run reconciliation for room, player, shuttle mark, planned match, activity, and paid-total counts.
- [ ] Manually verify room `2026-06-05`.

### Task 3: Add Normalized Read Repository

**Files:**
- Create: `lib/normalized-session.ts`
- Test: `tests/normalized-session.test.ts`

- [ ] Write failing tests that assemble `SessionState` from normalized rows.
- [ ] Implement typed row models and `assembleNormalizedSession`.
- [ ] Run focused tests.
- [ ] Add `loadNormalizedSession` and `listNormalizedSessions` Supabase queries.
- [ ] Run build/typecheck.

### Task 4: Add Transactional Mutation RPCs

**Files:**
- Create: `supabase/normalized-rpcs.sql`
- Modify: `lib/normalized-session.ts`
- Test: Supabase SQL queries

- [ ] Add RPCs for player create/update/delete.
- [ ] Add one transactional RPC for confirming four shuttle players.
- [ ] Add RPCs for historical mark changes, payment, pricing/current shuttle, planned matches, clear/reset, and close room.
- [ ] Reject all mutations for closed rooms.
- [ ] Apply RPC migration.
- [ ] Test concurrent payment and match confirmation against a temporary room.

### Task 5: Switch Home Page To Normalized Repository

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/normalized-session.ts`
- Test: `tests/home-page.test.tsx`

- [ ] Replace legacy room loading with normalized loading.
- [ ] Route each user mutation to its scoped RPC.
- [ ] Keep one-to-three-player current-match selection local until confirmation.
- [ ] Reload normalized state after successful mutations.
- [ ] Subscribe to normalized-table Realtime changes and refresh on focus.
- [ ] Retain pending export behavior for failed actions without auto-overwriting remote state.
- [ ] Run focused UI tests and build.

### Task 6: Switch Rooms Page And Lock Legacy Writes

**Files:**
- Modify: `app/rooms/page.tsx`
- Modify: `lib/normalized-session.ts`
- Modify: `supabase/schema.sql`

- [ ] Create rooms through normalized RPC.
- [ ] List and delete rooms through normalized storage.
- [ ] Revoke anon execution of legacy JSON save RPC.
- [ ] Revoke all anon writes to legacy JSON table.
- [ ] Verify existing normalized rooms remain accessible.

### Task 7: Production Cutover Verification

**Files:**
- Modify: `DEPLOY.md`

- [ ] Run full reconciliation again immediately before deployment.
- [ ] Build production client.
- [ ] Deploy client to Vercel.
- [ ] Verify room `2026-06-05` totals and current shuttle number.
- [ ] Verify two-device flow: device A confirms a match while device B records payment.
- [ ] Verify closed room is read-only.
- [ ] Document rollback using `badminton_sessions_backup`.
