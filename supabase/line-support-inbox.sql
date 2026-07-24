create table if not exists public.badminton_line_support_threads (
  id uuid primary key default gen_random_uuid(),
  requester_user_id text not null check (requester_user_id like 'U%'),
  requester_display_name text not null,
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists badminton_line_support_threads_requester_idx
on public.badminton_line_support_threads (requester_user_id, updated_at desc);

create table if not exists public.badminton_line_support_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.badminton_line_support_threads(id)
    on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin')),
  sender_line_user_id text not null check (sender_line_user_id like 'U%'),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists badminton_line_support_messages_thread_idx
on public.badminton_line_support_messages (thread_id, created_at);

create table if not exists public.badminton_line_support_reply_states (
  admin_user_id text primary key check (admin_user_id like 'U%'),
  thread_id uuid not null references public.badminton_line_support_threads(id)
    on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.badminton_line_support_threads enable row level security;
alter table public.badminton_line_support_messages enable row level security;
alter table public.badminton_line_support_reply_states enable row level security;

revoke all on table
  public.badminton_line_support_threads,
  public.badminton_line_support_messages,
  public.badminton_line_support_reply_states
from anon, authenticated;

grant select, insert, update, delete on table
  public.badminton_line_support_threads,
  public.badminton_line_support_messages,
  public.badminton_line_support_reply_states
to service_role;

grant usage, select on sequence
  public.badminton_line_support_messages_id_seq
to service_role;

comment on table public.badminton_line_support_threads is
  'Private server-only support conversations received through LINE Official Account.';
comment on table public.badminton_line_support_messages is
  'Private server-only message history for LINE support conversations.';
comment on table public.badminton_line_support_reply_states is
  'Short-lived server-only state selecting which LINE user an admin replies to next.';
