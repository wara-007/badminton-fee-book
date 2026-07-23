create table if not exists public.badminton_line_settings (
  id boolean primary key default true check (id),
  recipient_id text not null check (recipient_id ~ '^C'),
  recipient_type text not null default 'group' check (recipient_type = 'group'),
  group_name text,
  updated_at timestamptz not null default now()
);

alter table public.badminton_line_settings enable row level security;

revoke all on table public.badminton_line_settings from anon, authenticated;

comment on table public.badminton_line_settings is
  'Private server-only destination captured from verified LINE group webhooks.';
