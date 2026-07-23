create table if not exists public.badminton_line_announcements (
  announcement_date date primary key,
  recipient_id text not null check (
    recipient_id = 'broadcast' or recipient_id like 'C%'
  ),
  sent_at timestamptz not null default now()
);

alter table public.badminton_line_announcements enable row level security;
revoke all on public.badminton_line_announcements from anon, authenticated;

comment on table public.badminton_line_announcements is
  'Private delivery ledger preventing duplicate scheduled LINE Official Account broadcasts.';
