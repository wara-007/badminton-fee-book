begin;

-- Preserve a complete rollback source before copying data.
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

insert into public.badminton_rooms (
  id, base_fee, shuttle_fee, current_shuttle_number, revision, closed_at, created_at, updated_at
)
select
  id,
  coalesce((state->'pricing'->>'baseFee')::numeric, 90),
  coalesce((state->'pricing'->>'shuttleFee')::numeric, 26),
  greatest(coalesce((state->>'currentShuttleNumber')::integer, 1), 1),
  revision,
  closed_at,
  updated_at,
  updated_at
from public.badminton_sessions
on conflict (id) do nothing;

insert into public.badminton_players (
  id, room_id, name, position, skill_level, paid, paid_at, paid_amount,
  waiting_since, rest_until, game_count, created_at, updated_at
)
select
  player.value->>'id',
  session.id,
  player.value->>'name',
  player.ordinality::integer,
  case when player.value->>'skillLevel' in ('bg', 'n', 's', 'p-', 'p')
    then player.value->>'skillLevel' else 'n' end,
  coalesce((player.value->>'paid')::boolean, false),
  nullif(player.value->>'paidAt', '')::timestamptz,
  nullif(player.value->>'paidAmount', '')::numeric,
  nullif(player.value->>'waitingSince', '')::timestamptz,
  nullif(player.value->>'restUntil', '')::timestamptz,
  greatest(coalesce((player.value->>'gameCount')::integer, 0), 0),
  session.updated_at,
  session.updated_at
from public.badminton_sessions session
cross join lateral jsonb_array_elements(coalesce(session.state->'players', '[]'::jsonb))
with ordinality player(value, ordinality)
where player.value ? 'id' and player.value ? 'name'
on conflict do nothing;

insert into public.badminton_shuttle_marks (
  room_id, player_id, shuttle_number, position, created_at
)
select
  room_id,
  player_id,
  shuttle_number,
  row_number() over (
    partition by room_id, shuttle_number
    order by player_ordinality, mark_ordinality
  )::integer,
  updated_at
from (
  select
    session.id as room_id,
    player.value->>'id' as player_id,
    mark.value::integer as shuttle_number,
    player.ordinality as player_ordinality,
    mark.ordinality as mark_ordinality,
    session.updated_at
  from public.badminton_sessions session
  cross join lateral jsonb_array_elements(coalesce(session.state->'players', '[]'::jsonb))
  with ordinality player(value, ordinality)
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(player.value->'shuttleMarks') = 'array' then player.value->'shuttleMarks'
      else '[]'::jsonb
    end
  ) with ordinality mark(value, ordinality)
  where mark.value ~ '^[1-9][0-9]*$'
    and not exists (
      select 1 from public.badminton_shuttle_marks existing where existing.room_id = session.id
    )
) legacy_marks;

insert into public.badminton_planned_matches (
  id, room_id, label, position, confirmed, updated_at
)
select
  session.id || ':' || coalesce(match.value->>'id', 'match-' || match.ordinality),
  session.id,
  coalesce(match.value->>'label', 'Match ' || match.ordinality),
  match.ordinality::integer,
  coalesce((match.value->>'confirmed')::boolean, false),
  session.updated_at
from public.badminton_sessions session
cross join lateral jsonb_array_elements(coalesce(session.state->'plannedMatches', '[]'::jsonb))
with ordinality match(value, ordinality)
where not exists (
  select 1 from public.badminton_planned_matches existing where existing.room_id = session.id
);

insert into public.badminton_planned_match_players (match_id, room_id, player_id, position)
select
  session.id || ':' || coalesce(match.value->>'id', 'match-' || match.ordinality),
  session.id,
  player_id.value,
  player_id.ordinality::integer
from public.badminton_sessions session
cross join lateral jsonb_array_elements(coalesce(session.state->'plannedMatches', '[]'::jsonb))
with ordinality match(value, ordinality)
cross join lateral jsonb_array_elements_text(coalesce(match.value->'playerIds', '[]'::jsonb))
with ordinality player_id(value, ordinality)
join public.badminton_players player
  on player.id = player_id.value and player.room_id = session.id
on conflict do nothing;

commit;
