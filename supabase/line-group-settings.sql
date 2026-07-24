create table if not exists public.badminton_line_settings (
  id boolean primary key default true check (id),
  recipient_id text not null check (recipient_id ~ '^C'),
  recipient_type text not null default 'group' check (recipient_type = 'group'),
  group_name text,
  updated_at timestamptz not null default now()
);

alter table public.badminton_line_settings enable row level security;

revoke all on table public.badminton_line_settings from anon, authenticated;
grant select, insert, update, delete
on table public.badminton_line_settings to service_role;

comment on table public.badminton_line_settings is
  'Private server-only destination captured from verified LINE group webhooks.';

create table if not exists public.badminton_line_group_destinations (
  group_id text primary key check (group_id ~ '^C'),
  group_type text not null check (group_type in ('admin', 'public')),
  group_name text,
  enabled boolean not null default true,
  registered_by text check (registered_by is null or registered_by ~ '^U'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.badminton_line_group_destinations enable row level security;

revoke all on table public.badminton_line_group_destinations
from anon, authenticated;
grant select, insert, update, delete
on table public.badminton_line_group_destinations to service_role;

comment on table public.badminton_line_group_destinations is
  'Private server-only LINE group destinations explicitly registered by an authorized LINE admin.';
