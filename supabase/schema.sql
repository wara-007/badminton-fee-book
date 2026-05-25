create table if not exists public.badminton_sessions (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.current_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

grant execute on function public.current_server_time() to anon;

alter table public.badminton_sessions enable row level security;

drop policy if exists "Public read badminton sessions" on public.badminton_sessions;
create policy "Public read badminton sessions"
on public.badminton_sessions
for select
to anon
using (true);

drop policy if exists "Public write badminton sessions" on public.badminton_sessions;
create policy "Public write badminton sessions"
on public.badminton_sessions
for insert
to anon
with check (true);

drop policy if exists "Public update badminton sessions" on public.badminton_sessions;
create policy "Public update badminton sessions"
on public.badminton_sessions
for update
to anon
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.badminton_sessions;
exception
  when duplicate_object then null;
end $$;
