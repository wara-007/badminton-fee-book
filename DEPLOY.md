# Deploy With Supabase And Vercel

## Supabase

1. Create a free Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy Project URL and anon public key from Project Settings > API.

## Local Env

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DATABASE_LIMIT_MB=500
CRON_SECRET=use-a-random-string-with-at-least-16-characters
LINE_CHANNEL_ACCESS_TOKEN=your-line-messaging-api-channel-access-token
LINE_CHANNEL_SECRET=your-line-messaging-api-channel-secret
LINE_ALERT_TO=your-line-user-group-or-room-id
LINE_ADMIN_USER_IDS=U1234567890,U0987654321
LINE_ADMIN_SETUP_CODE=one-time-private-chat-code
```

`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and the LINE values are server-only.
Never prefix them with `NEXT_PUBLIC_`.

## Normalized Storage Staged Migration

Do not delete or disable `public.badminton_sessions` during the initial rollout.
It remains the rollback source until two-device verification passes.

1. Stop active use of the app temporarily.
2. Run `supabase/archive-existing-normalized.sql` to preserve any previous
   normalized rollout in `badminton_normalized_archive`.
3. Run `supabase/normalized-schema.sql`.
4. Run `supabase/migrate-legacy-sessions.sql`.
5. Run `supabase/reconcile-normalized-sessions.sql`.
6. Confirm mismatch and invalid-relation results are empty and room counts match.
   Duplicate player IDs across different rooms are valid.
7. Run `supabase/normalized-rpcs.sql`.
8. Deploy the client and verify every flow in a temporary room:
   add/edit/delete player, shuttle marks, planned matches, individual and batch
   payment, pricing, clear/reset, close/delete room, and concurrent devices.

After the SQL and temporary-room checks pass, normalized tables are the
production source of truth. Keep `badminton_sessions` unchanged for rollback.
Do not run `migrate-legacy-sessions.sql` again after cutover because older
clients may continue writing stale legacy rows. Reconcile from legacy only
before the normalized client is deployed.

Rollback: deploy the legacy client and restore the required room snapshot from
normalized tables or an approved backup first. Do not assume the unchanged
legacy row contains changes made after cutover.
Legacy activity logs are also retained during the staged rollout.

Restart `npm run dev`.

## Database Usage Alert

The Data tab reads database size from `/api/database-usage`. Vercel calls the
same endpoint every day at 09:00 Asia/Bangkok (02:00 UTC) and sends a LINE push
message at 80% usage (warning) or 90% usage (critical).

1. Run the latest `supabase/normalized-rpcs.sql` to install the protected usage RPC.
2. Add all server-only variables above to the Vercel Production environment.
3. Add the LINE Official Account to the target user or group before using its ID.
4. Deploy production. Vercel Cron does not run on preview deployments.

## Automatic Session Opening

Vercel calls `/api/sessions/auto-open` every Tuesday, Friday, and Sunday at
16:00 Asia/Bangkok (09:00 UTC). The endpoint creates a room named with the
Bangkok date in `YYYY-MM-DD` format and sends its link privately to every
enabled LINE admin. It never sends the room URL to a group. Repeated calls are
safe: an existing room is preserved and is not announced again.

To run an end-to-end check before the scheduled day, call the protected route
with a scheduled Bangkok date, for example
`/api/sessions/auto-open?date=2026-07-24`, and include
`Authorization: Bearer $CRON_SECRET`. The override remains protected and uses
the same duplicate prevention as the scheduled job. An explicit date may be
outside the normal Tuesday, Friday, and Sunday schedule for testing.

This job uses the existing `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and
`LINE_CHANNEL_ACCESS_TOKEN` server-only variables. Admins are loaded from
`badminton_line_admins`, with user IDs from `LINE_ADMIN_USER_IDS` and a
user-type `LINE_ALERT_TO` retained only as backward-compatible admin
fallbacks. Group IDs are never used for room announcements.

## LINE Group Destination

Run `supabase/line-group-settings.sql`, then configure the Messaging API webhook
URL as `https://badminton-fee-book.vercel.app/api/line/webhook` and add
`LINE_CHANNEL_SECRET` to Vercel Production. Enable `Allow bot to join group
chats` in LINE Developers before inviting the Official Account.

The webhook verifies `x-line-signature` against the untouched request body.
When the Official Account joins or receives an event in a group, the latest
group ID is stored privately in Supabase. Automatic session announcements use
that group first and fall back to `LINE_ALERT_TO` until a group is captured.

Run `supabase/line-admin-payments.sql` to install the service-role-only,
idempotent payment confirmation function. `LINE_ADMIN_USER_IDS` is a
comma-separated allowlist of LINE user IDs that may use payment commands. For
backward compatibility, if the allowlist is empty and `LINE_ALERT_TO` is a
LINE user ID beginning with `U`, that user is treated as the only admin.
If neither value identifies an admin, send `ตั้งแอดมิน <LINE_ADMIN_SETUP_CODE>`
to the Official Account in a private chat. Only the first enabled admin can be
registered with this code; never post it in a group.

Additional admins send `ขอเป็นแอดมิน` in a private chat with the Official
Account. Existing admins receive private `อนุมัติ` and `ปฏิเสธ` buttons. The
request is single-use, decisions are recorded atomically, and the requester is
notified of the result.

## Scheduled LINE Group Announcement

Vercel calls `/api/line/announcement` every Tuesday, Friday, and Sunday at
13:00 Asia/Bangkok (06:00 UTC). It broadcasts
`public/line-announcement.jpg` and a weekday-aware public invitation from the
LINE Official Account to all eligible friends/followers. The message never
contains the admin room URL. Delivery is recorded in
`badminton_line_announcements` so a retry cannot announce the same date twice.
Tuesday and Friday invitations show 20:00-00:30; Sunday invitations show
18:00-22:00.

Run `supabase/line-announcements.sql` before deployment. An authorized manual
check can use `/api/line/announcement?date=2026-07-24` with
`Authorization: Bearer $CRON_SECRET`.

Admin commands:

- `ยอด สมชาย` uses today's Bangkok room.
- `ยอด สมชาย 2026-07-21` uses the specified room.
- If several names contain the query, LINE displays buttons for choosing the
  exact player.
- The payment card contains a fixed-amount PromptPay QR and a
  `ยืนยันว่าจ่ายแล้ว` postback button. Confirmation recalculates the amount
  inside Postgres, records the selected payment account, increments the room
  revision, and is safe to press repeatedly.

## Vercel

1. Import this project into Vercel.
2. Add the same two environment variables.
3. Deploy.

Use the same session code on multiple devices to sync the same badminton round.

## Impeccable

Run the Impeccable detector before shipping UI changes:

```bash
npm run impeccable:detect
```

Keep the skills package current:

```bash
npm run impeccable:skills
```
