create table if not exists public.badminton_sessions (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.badminton_sessions
add column if not exists revision bigint not null default 1;

alter table public.badminton_sessions
add column if not exists closed_at timestamptz;

create table if not exists public.badminton_session_history (
  history_id bigint generated always as identity primary key,
  session_id text not null,
  revision bigint not null,
  state jsonb not null,
  saved_at timestamptz not null default now()
);

create index if not exists badminton_session_history_session_revision_idx
on public.badminton_session_history (session_id, revision desc);

create or replace function public.set_badminton_session_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_badminton_session_updated_at on public.badminton_sessions;
create trigger set_badminton_session_updated_at
before insert or update on public.badminton_sessions
for each row
execute function public.set_badminton_session_updated_at();

create or replace function public.save_badminton_session(
  p_id text,
  p_state jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.badminton_sessions%rowtype;
  saved_row public.badminton_sessions%rowtype;
begin
  select *
  into current_row
  from public.badminton_sessions
  where id = p_id
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object(
        'saved', false,
        'revision', 0,
        'state', null,
        'updated_at', now()
      );
    end if;

    insert into public.badminton_sessions (id, state, revision)
    values (p_id, p_state, 1)
    returning * into saved_row;
  else
    if current_row.revision <> p_expected_revision then
      return jsonb_build_object(
        'saved', false,
        'revision', current_row.revision,
        'state', current_row.state,
        'updated_at', current_row.updated_at
      );
    end if;

    if current_row.closed_at is not null then
      return jsonb_build_object(
        'saved', false,
        'revision', current_row.revision,
        'state', current_row.state,
        'updated_at', current_row.updated_at,
        'closed_at', current_row.closed_at
      );
    end if;

    if not exists (
      select 1
      from public.badminton_session_history
      where session_id = current_row.id
        and saved_at >= now() - interval '10 minutes'
    ) then
      insert into public.badminton_session_history (session_id, revision, state, saved_at)
      values (current_row.id, current_row.revision, current_row.state, current_row.updated_at);
    end if;

    update public.badminton_sessions
    set state = p_state,
        revision = current_row.revision + 1
    where id = p_id
    returning * into saved_row;
  end if;

  return jsonb_build_object(
    'saved', true,
    'revision', saved_row.revision,
    'state', saved_row.state,
    'updated_at', saved_row.updated_at,
    'closed_at', saved_row.closed_at
  );
end;
$$;

create or replace function public.close_badminton_session(p_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_time timestamptz;
begin
  update public.badminton_sessions
  set closed_at = coalesce(closed_at, now())
  where id = p_id
  returning closed_at into closed_time;

  if closed_time is null then
    raise exception 'Session not found';
  end if;

  return closed_time;
end;
$$;

create or replace function public.current_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

grant execute on function public.current_server_time() to anon;
revoke all on function public.save_badminton_session(text, jsonb, bigint) from public;
grant execute on function public.save_badminton_session(text, jsonb, bigint) to anon;
revoke all on function public.close_badminton_session(text) from public;
grant execute on function public.close_badminton_session(text) to anon;

alter table public.badminton_session_history enable row level security;
revoke all on table public.badminton_session_history from anon;

alter table public.badminton_sessions enable row level security;

drop policy if exists "Public read badminton sessions" on public.badminton_sessions;
create policy "Public read badminton sessions"
on public.badminton_sessions
for select
to anon
using (true);

drop policy if exists "Public write badminton sessions" on public.badminton_sessions;
drop policy if exists "Public update badminton sessions" on public.badminton_sessions;
revoke insert, update on table public.badminton_sessions from anon;

drop policy if exists "Public delete badminton sessions" on public.badminton_sessions;
revoke delete on table public.badminton_sessions from anon;
drop function if exists public.delete_badminton_session(text);

do $$
begin
  alter publication supabase_realtime add table public.badminton_sessions;
exception
  when duplicate_object then null;
end $$;
