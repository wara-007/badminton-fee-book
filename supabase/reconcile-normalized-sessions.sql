-- Run after migrate-legacy-sessions.sql and before cutover. Every mismatch
-- count must be zero. Do not use legacy as the comparison source after cutover.
with legacy as (
  select
    id,
    jsonb_array_length(coalesce(state->'players', '[]'::jsonb)) as player_count,
    coalesce((
      select sum(jsonb_array_length(coalesce(player->'shuttleMarks', '[]'::jsonb)))
      from jsonb_array_elements(coalesce(state->'players', '[]'::jsonb)) player
    ), 0) as mark_count,
    jsonb_array_length(coalesce(state->'plannedMatches', '[]'::jsonb)) as planned_match_count,
    coalesce((state->'pricing'->>'baseFee')::numeric, 90) as base_fee,
    coalesce((state->'pricing'->>'shuttleFee')::numeric, 26) as shuttle_fee,
    greatest(coalesce((state->>'currentShuttleNumber')::integer, 1), 1) as current_shuttle_number
  from public.badminton_sessions
),
normalized as (
  select
    room.id,
    count(distinct (player.room_id, player.id)) as player_count,
    count(distinct mark.id) as mark_count,
    count(distinct planned.id) as planned_match_count,
    room.base_fee,
    room.shuttle_fee,
    room.current_shuttle_number
  from public.badminton_rooms room
  left join public.badminton_players player on player.room_id = room.id
  left join public.badminton_shuttle_marks mark on mark.room_id = room.id
  left join public.badminton_planned_matches planned on planned.room_id = room.id
  group by room.id
)
select
  legacy.id as room_id,
  legacy.player_count as legacy_players,
  normalized.player_count as normalized_players,
  legacy.mark_count as legacy_marks,
  normalized.mark_count as normalized_marks,
  legacy.planned_match_count as legacy_planned_matches,
  normalized.planned_match_count as normalized_planned_matches,
  legacy.base_fee = normalized.base_fee as base_fee_matches,
  legacy.shuttle_fee = normalized.shuttle_fee as shuttle_fee_matches,
  legacy.current_shuttle_number = normalized.current_shuttle_number as current_shuttle_matches
from legacy
left join normalized using (id)
where normalized.id is null
   or legacy.player_count <> normalized.player_count
   or legacy.mark_count <> normalized.mark_count
   or legacy.planned_match_count <> normalized.planned_match_count
   or legacy.base_fee <> normalized.base_fee
   or legacy.shuttle_fee <> normalized.shuttle_fee
   or legacy.current_shuttle_number <> normalized.current_shuttle_number
order by legacy.id;

select
  (select count(*) from public.badminton_sessions) as legacy_rooms,
  (select count(*) from public.badminton_rooms) as normalized_rooms,
  (select count(*) from public.badminton_sessions_backup) as backup_snapshots;

-- Duplicate player IDs across rooms are valid and must remain separate rows.
select id, count(*) as room_count
from public.badminton_players
group by id
having count(*) > 1
order by id;

-- Both queries must return no rows.
select mark.room_id, mark.player_id
from public.badminton_shuttle_marks mark
left join public.badminton_players player
  on player.room_id = mark.room_id and player.id = mark.player_id
where player.id is null;

select entry.room_id, entry.match_id, entry.player_id
from public.badminton_planned_match_players entry
left join public.badminton_planned_matches planned
  on planned.room_id = entry.room_id and planned.id = entry.match_id
left join public.badminton_players player
  on player.room_id = entry.room_id and player.id = entry.player_id
where planned.id is null or player.id is null;
