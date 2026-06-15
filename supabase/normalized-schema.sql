create table if not exists public.badminton_sessions_backup (
  backup_id bigint generated always as identity primary key,
  room_id text not null,
  revision bigint,
  state jsonb not null,
  source_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

insert into public.badminton_sessions_backup (room_id, revision, state, source_updated_at)
select id, revision, state, updated_at
from public.badminton_sessions legacy
where not exists (
  select 1
  from public.badminton_sessions_backup backup
  where backup.room_id = legacy.id
    and backup.revision is not distinct from legacy.revision
    and backup.state = legacy.state
);

create table if not exists public.badminton_rooms (
  id text primary key,
  base_fee numeric not null default 90 check (base_fee >= 0),
  shuttle_fee numeric not null default 26 check (shuttle_fee >= 0),
  current_shuttle_number integer not null default 1 check (current_shuttle_number > 0),
  revision bigint not null default 1,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.badminton_players (
  id text not null,
  room_id text not null references public.badminton_rooms(id) on delete cascade,
  name text not null,
  position integer not null check (position > 0),
  skill_level text not null default 'n' check (skill_level in ('bg', 'n', 's', 'p-', 'p')),
  paid boolean not null default false,
  paid_at timestamptz,
  paid_amount numeric check (paid_amount >= 0),
  waiting_since timestamptz,
  rest_until timestamptz,
  game_count integer not null default 0 check (game_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, id)
);

create unique index if not exists badminton_players_room_name_idx
on public.badminton_players (room_id, lower(name));

create index if not exists badminton_players_room_idx
on public.badminton_players (room_id);

create unique index if not exists badminton_players_room_position_idx
on public.badminton_players (room_id, position);

create table if not exists public.badminton_shuttle_marks (
  id bigint generated always as identity primary key,
  room_id text not null references public.badminton_rooms(id) on delete cascade,
  player_id text not null,
  shuttle_number integer not null check (shuttle_number > 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  foreign key (room_id, player_id)
    references public.badminton_players(room_id, id) on delete cascade
);

create index if not exists badminton_shuttle_marks_room_player_idx
on public.badminton_shuttle_marks (room_id, player_id);

create table if not exists public.badminton_planned_matches (
  id text primary key,
  room_id text not null references public.badminton_rooms(id) on delete cascade,
  label text not null,
  position integer not null check (position > 0),
  confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (room_id, position),
  unique (room_id, id)
);

create table if not exists public.badminton_planned_match_players (
  match_id text not null,
  room_id text not null,
  player_id text not null,
  position integer not null check (position > 0),
  primary key (match_id, position),
  unique (match_id, player_id),
  foreign key (room_id, match_id)
    references public.badminton_planned_matches(room_id, id) on delete cascade,
  foreign key (room_id, player_id)
    references public.badminton_players(room_id, id) on delete cascade
);

-- Keep legacy activity logs during staged rollout for rollback and auditing.

alter table public.badminton_sessions_backup enable row level security;
alter table public.badminton_rooms enable row level security;
alter table public.badminton_players enable row level security;
alter table public.badminton_shuttle_marks enable row level security;
alter table public.badminton_planned_matches enable row level security;
alter table public.badminton_planned_match_players enable row level security;

revoke all on public.badminton_sessions_backup from anon;
revoke insert, update, delete on public.badminton_rooms from anon;
revoke insert, update, delete on public.badminton_players from anon;
revoke insert, update, delete on public.badminton_shuttle_marks from anon;
revoke insert, update, delete on public.badminton_planned_matches from anon;
revoke insert, update, delete on public.badminton_planned_match_players from anon;

drop policy if exists "Public read badminton rooms" on public.badminton_rooms;
create policy "Public read badminton rooms" on public.badminton_rooms for select to anon using (true);
drop policy if exists "Public read badminton players" on public.badminton_players;
create policy "Public read badminton players" on public.badminton_players for select to anon using (true);
drop policy if exists "Public read badminton shuttle marks" on public.badminton_shuttle_marks;
create policy "Public read badminton shuttle marks" on public.badminton_shuttle_marks for select to anon using (true);
drop policy if exists "Public read badminton planned matches" on public.badminton_planned_matches;
create policy "Public read badminton planned matches" on public.badminton_planned_matches for select to anon using (true);
drop policy if exists "Public read badminton planned match players" on public.badminton_planned_match_players;
create policy "Public read badminton planned match players" on public.badminton_planned_match_players for select to anon using (true);

do $$
begin
  alter publication supabase_realtime add table public.badminton_rooms;
exception
  when duplicate_object then null;
end $$;
