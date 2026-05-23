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
```

Restart `npm run dev`.

## Vercel

1. Import this project into Vercel.
2. Add the same two environment variables.
3. Deploy.

Use the same session code on multiple devices to sync the same badminton round.
