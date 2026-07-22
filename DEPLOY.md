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
LINE_ALERT_TO=your-line-user-group-or-room-id
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
