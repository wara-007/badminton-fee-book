# Normalized Supabase Storage Design

## Goal

Replace whole-room JSON writes with normalized PostgreSQL tables so concurrent
devices update only the records they own and cannot overwrite unrelated data.
The existing `public.badminton_sessions` JSON rows remain as read-only backups.

## Cutover Strategy

The application will be taken out of active use during migration. The cutover
is performed in this order:

1. Copy every existing JSON room into a timestamped backup table.
2. Create the normalized tables, constraints, indexes, RLS policies, and RPCs.
3. Migrate every JSON room into the normalized tables in one transaction.
4. Run reconciliation queries comparing JSON and normalized data.
5. Deploy the client that reads and writes only normalized tables.
6. Verify production from two devices.
7. Revoke write access to the legacy JSON table.

If reconciliation or client verification fails, the client remains on the
legacy implementation and the normalized tables can be rebuilt from the JSON
backup.

## Data Model

### `badminton_rooms`

- `id text primary key`
- `base_fee numeric not null`
- `shuttle_fee numeric not null`
- `current_shuttle_number integer not null`
- `closed_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `badminton_players`

- `id uuid primary key`
- `room_id text not null references badminton_rooms(id) on delete cascade`
- `name text not null`
- `skill_level text not null`
- `paid boolean not null`
- `paid_at timestamptz`
- `paid_amount numeric`
- `waiting_since timestamptz`
- `rest_until timestamptz`
- `game_count integer not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Player names are unique within a room using a case-insensitive unique index.

### `badminton_shuttle_marks`

- `id bigint generated always as identity primary key`
- `room_id text not null references badminton_rooms(id) on delete cascade`
- `player_id uuid not null references badminton_players(id) on delete cascade`
- `shuttle_number integer not null`
- `position integer not null`
- `created_at timestamptz not null`

`position` preserves repeated player marks and display order. A unique
constraint on `(room_id, shuttle_number, position)` prevents more than one
player occupying the same position. Confirming a match inserts four positions
in one transaction.

### `badminton_planned_matches`

- `id text primary key`
- `room_id text not null references badminton_rooms(id) on delete cascade`
- `label text not null`
- `position integer not null`
- `confirmed boolean not null`
- `updated_at timestamptz not null`

### `badminton_planned_match_players`

- `match_id text not null references badminton_planned_matches(id) on delete cascade`
- `player_id uuid not null references badminton_players(id) on delete cascade`
- `position integer not null`
- primary key `(match_id, position)`
- unique `(match_id, player_id)`

### `badminton_activity_logs`

- `id text primary key`
- `room_id text not null references badminton_rooms(id) on delete cascade`
- `action text not null`
- `message text not null`
- `created_at timestamptz not null`

Activity logs retain all events instead of truncating to the latest 20 rows.

### `badminton_sessions_backup`

- `backup_id bigint generated always as identity primary key`
- `room_id text not null`
- `revision bigint`
- `state jsonb not null`
- `source_updated_at timestamptz`
- `backed_up_at timestamptz not null`

This table is private and has no anon access.

## Write Operations

Client mutations use narrowly scoped RPCs instead of direct table writes.

- Create/update/remove player
- Confirm a four-player shuttle match
- Remove or replace a historical shuttle mark
- Update payment
- Update room pricing/current shuttle
- Update planned match
- Close room
- Reset or clear room

Each RPC:

- Locks only affected rows.
- Rejects writes when the room is closed.
- Executes the complete action in one transaction.
- Uses server timestamps.
- Adds an activity-log row where appropriate.
- Returns the updated records needed by the client.

Selecting the first one to three players for the current match remains local
draft state. Confirming four players calls one transaction.

## Read And Realtime Flow

Opening a room loads its room row, players, marks, planned matches, and recent
activity logs from normalized tables. Supabase Realtime subscriptions listen to
these tables filtered by room where supported.

When the browser regains focus or visibility, it reloads the room data from
Supabase. Supabase is the only source of truth. Local storage stores only a
pending action/export payload after a failed mutation; it never overwrites
remote data automatically.

## Migration

The migration SQL reads every legacy JSON room and inserts:

- One `badminton_rooms` row.
- One row per player.
- One row per shuttle mark, preserving each player's mark sequence.
- Planned-match rows and their player positions.
- Every activity entry currently present in the JSON.

The migration runs transactionally. Any invalid room aborts the migration
before client cutover.

## Reconciliation

Before deployment, reconciliation must show no mismatches for:

- Room count and IDs.
- Player count per room.
- Player names, payment state, payment amounts, and game counts.
- Shuttle-mark count and maximum shuttle number per room.
- Current shuttle number and pricing.
- Planned match and planned-match-player counts.
- Activity-log counts.
- Calculated paid totals.

The existing room `2026-06-05` receives an explicit manual comparison because
it contains known production data.

## Security

Normalized tables have RLS enabled. Anon clients receive read access because
the current application has no Supabase Auth. Writes are allowed only through
the scoped RPC functions. Backup and legacy JSON tables have no anon write
access.

The existing application passwords are client-visible and are not treated as
database authorization. Adding Supabase Auth is outside this migration scope.

## Error Handling

- Failed mutations retain a local pending action for export/retry.
- RPC conflicts return a user-facing message and trigger a remote reload.
- Closed-room writes return a read-only message.
- Failed room loads do not replace the current screen with stale local data.
- Migration failures roll back the normalized transaction.

## Testing

- Unit tests for row-to-session mapping and pending-action handling.
- Integration tests for every mutation RPC.
- Concurrency tests proving payment and match confirmation do not overwrite
  each other.
- Closed-room mutation tests.
- Migration and reconciliation tests against copied production JSON.
- Two-browser end-to-end verification after deployment.

## Rollback

Until normalized production verification succeeds, `badminton_sessions` and
`badminton_sessions_backup` remain untouched. Rollback deploys the previous
client and restores any required JSON row from the backup table. The legacy
table is not deleted as part of this project.
