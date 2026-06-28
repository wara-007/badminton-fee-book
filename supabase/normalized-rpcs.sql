create or replace function public.close_normalized_badminton_room(p_room_id text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare result timestamptz;
begin
  update public.badminton_rooms set closed_at=coalesce(closed_at, now()), updated_at=now()
  where id=p_room_id returning closed_at into result;
  if result is null then raise exception 'Room not found'; end if;
  return result;
end $$;

create or replace function public.delete_normalized_badminton_room(p_room_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_room_id='main' then raise exception 'The main room cannot be deleted'; end if;
  delete from public.badminton_rooms where id=p_room_id;
  return found;
end $$;

drop function if exists public.upsert_badminton_room_dashboard_snapshot(text,timestamptz,integer,integer,integer,numeric,jsonb);
drop function if exists public.upsert_badminton_room_dashboard_snapshot(text,timestamptz,integer,integer,integer,numeric,jsonb,jsonb);

create or replace function public.upsert_badminton_room_dashboard_snapshot(
  p_room_id text,
  p_started_at timestamptz,
  p_people_count integer,
  p_customer_count integer,
  p_shuttle_count integer,
  p_received_amount numeric,
  p_received_by_account jsonb default '{"gsb": 0, "kasikorn": 0}'::jsonb,
  p_joined_by_hour jsonb default '{}'::jsonb,
  p_paid_by_hour jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  snapshot public.badminton_room_dashboard_snapshots%rowtype;
begin
  insert into public.badminton_room_dashboard_snapshots(
    room_id,
    started_at,
    captured_at,
    people_count,
    customer_count,
    shuttle_count,
    received_amount,
    received_by_account,
    joined_by_hour,
    paid_by_hour
  ) values (
    p_room_id,
    p_started_at,
    now(),
    greatest(coalesce(p_people_count, 0), 0),
    greatest(coalesce(p_customer_count, 0), 0),
    greatest(coalesce(p_shuttle_count, 0), 0),
    greatest(coalesce(p_received_amount, 0), 0),
    jsonb_build_object(
      'gsb', greatest(coalesce((p_received_by_account->>'gsb')::numeric, 0), 0),
      'kasikorn', greatest(coalesce((p_received_by_account->>'kasikorn')::numeric, 0), 0)
    ),
    coalesce(p_joined_by_hour, '{}'::jsonb),
    coalesce(p_paid_by_hour, '{}'::jsonb)
  )
  on conflict (room_id) do update set
    started_at=excluded.started_at,
    captured_at=excluded.captured_at,
    people_count=excluded.people_count,
    customer_count=excluded.customer_count,
    shuttle_count=excluded.shuttle_count,
    received_amount=excluded.received_amount,
    received_by_account=excluded.received_by_account,
    joined_by_hour=excluded.joined_by_hour,
    paid_by_hour=excluded.paid_by_hour
  returning * into snapshot;

  return jsonb_build_object(
    'room_id', snapshot.room_id,
    'started_at', snapshot.started_at,
    'captured_at', snapshot.captured_at,
    'people_count', snapshot.people_count,
    'customer_count', snapshot.customer_count,
    'shuttle_count', snapshot.shuttle_count,
    'received_amount', snapshot.received_amount,
    'received_by_account', snapshot.received_by_account,
    'joined_by_hour', snapshot.joined_by_hour,
    'paid_by_hour', snapshot.paid_by_hour
  );
end $$;

create or replace function public.list_badminton_room_dashboard_snapshots()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'room_id', snapshot.room_id,
        'started_at', snapshot.started_at,
        'captured_at', snapshot.captured_at,
        'people_count', snapshot.people_count,
        'customer_count', snapshot.customer_count,
        'shuttle_count', snapshot.shuttle_count,
        'received_amount', snapshot.received_amount,
        'received_by_account', snapshot.received_by_account,
        'joined_by_hour', snapshot.joined_by_hour,
        'paid_by_hour', snapshot.paid_by_hour
      )
      order by snapshot.started_at desc
    ),
    '[]'::jsonb
  )
  from public.badminton_room_dashboard_snapshots snapshot
$$;

create or replace function public.get_badminton_payment_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'selected_account_id',
    coalesce(
      (select selected_account_id from public.badminton_payment_settings where id=true),
      'gsb'
    )
  )
$$;

create or replace function public.set_badminton_payment_account(p_selected_account_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  next_account_id text;
begin
  if p_selected_account_id not in ('gsb', 'kasikorn') then
    raise exception 'Unknown payment account';
  end if;

  insert into public.badminton_payment_settings(id, selected_account_id, updated_at)
  values(true, p_selected_account_id, now())
  on conflict (id) do update set
    selected_account_id=excluded.selected_account_id,
    updated_at=excluded.updated_at
  returning selected_account_id into next_account_id;

  return jsonb_build_object('selected_account_id', next_account_id);
end $$;

create or replace function public.build_normalized_badminton_state(p_room_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id, 'name', player.name, 'skillLevel', player.skill_level,
        'shuttleCount', (select count(*) from public.badminton_shuttle_marks mark where mark.room_id=player.room_id and mark.player_id=player.id),
        'shuttleMarks', coalesce((select jsonb_agg(mark.shuttle_number order by mark.shuttle_number, mark.position) from public.badminton_shuttle_marks mark where mark.room_id=player.room_id and mark.player_id=player.id), '[]'::jsonb),
        'paid', player.paid, 'paidAt', player.paid_at, 'paidAmount', player.paid_amount,
        'paidAccountId', coalesce(player.paid_account_id, 'gsb'),
        'joinedAt', player.joined_at,
        'waitingSince', player.waiting_since, 'restUntil', player.rest_until, 'gameCount', player.game_count
      ) order by player.position)
      from public.badminton_players player where player.room_id=room.id
    ), '[]'::jsonb),
    'pricing', jsonb_build_object('baseFee', room.base_fee, 'shuttleFee', room.shuttle_fee),
    'currentShuttleNumber', room.current_shuttle_number,
    'plannedMatches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', replace(match.id, room.id || ':', ''), 'label', match.label, 'confirmed', match.confirmed,
        'playerIds', coalesce((select jsonb_agg(entry.player_id order by entry.position) from public.badminton_planned_match_players entry where entry.room_id=room.id and entry.match_id=match.id), '[]'::jsonb)
      ) order by match.position)
      from public.badminton_planned_matches match where match.room_id=room.id
    ), '[]'::jsonb),
    'activityLog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', activity.id, 'action', activity.action, 'message', activity.message,
        'createdAt', activity.created_at
      ) order by activity.position)
      from public.badminton_match_events activity where activity.room_id=room.id
    ), '[]'::jsonb),
    'updatedAt', room.updated_at
  )
  from public.badminton_rooms room where room.id=p_room_id
$$;

create or replace function public.load_normalized_badminton_session(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'saved', true, 'revision', room.revision,
    'state', public.build_normalized_badminton_state(room.id),
    'updated_at', room.updated_at, 'closed_at', room.closed_at
  )
  from public.badminton_rooms room where room.id=p_id
$$;

create or replace function public.save_normalized_badminton_session(
  p_id text, p_state jsonb, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  room public.badminton_rooms%rowtype;
  player jsonb;
  mark text;
  planned jsonb;
  player_id text;
  player_position integer;
  planned_position integer := 0;
  activity jsonb;
  activity_position integer := 0;
  mark_position integer;
  room_player_position integer := 0;
begin
  select * into room from public.badminton_rooms where id=p_id for update;
  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object('saved', false, 'revision', 0, 'state', null, 'updated_at', now());
    end if;
    insert into public.badminton_rooms(id) values(p_id) returning * into room;
  elsif room.revision <> p_expected_revision or room.closed_at is not null then
    return jsonb_build_object(
      'saved', false, 'revision', room.revision,
      'state', public.build_normalized_badminton_state(p_id),
      'updated_at', room.updated_at, 'closed_at', room.closed_at
    );
  end if;

  delete from public.badminton_planned_matches where room_id=p_id;
  delete from public.badminton_match_events where room_id=p_id;
  delete from public.badminton_shuttle_marks where room_id=p_id;
  delete from public.badminton_players where room_id=p_id;

  for player in
    select element from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) as items(element)
  loop
    room_player_position := room_player_position + 1;
    insert into public.badminton_players(
      room_id,id,name,position,skill_level,paid,paid_at,paid_amount,paid_account_id,joined_at,waiting_since,rest_until,game_count
    ) values (
      p_id, player->>'id', player->>'name', room_player_position, coalesce(player->>'skillLevel','n'),
      coalesce((player->>'paid')::boolean,false), nullif(player->>'paidAt','')::timestamptz,
      nullif(player->>'paidAmount','')::numeric,
      case
        when coalesce((player->>'paid')::boolean,false)
          then case when player->>'paidAccountId' in ('gsb','kasikorn') then player->>'paidAccountId' else 'gsb' end
        else null
      end,
      coalesce(nullif(player->>'joinedAt','')::timestamptz, nullif(player->>'waitingSince','')::timestamptz, now()),
      nullif(player->>'waitingSince','')::timestamptz,
      nullif(player->>'restUntil','')::timestamptz, greatest(coalesce((player->>'gameCount')::integer,0),0)
    );
    mark_position := 0;
    for mark in
      select element from jsonb_array_elements_text(coalesce(player->'shuttleMarks','[]'::jsonb)) as items(element)
    loop
      mark_position := mark_position + 1;
      insert into public.badminton_shuttle_marks(room_id,player_id,shuttle_number,position)
      values(p_id,player->>'id',mark::integer,mark_position);
    end loop;
  end loop;

  for planned in
    select element from jsonb_array_elements(coalesce(p_state->'plannedMatches','[]'::jsonb)) as items(element)
  loop
    planned_position := planned_position + 1;
    insert into public.badminton_planned_matches(id,room_id,label,position,confirmed)
    values(p_id || ':' || (planned->>'id'),p_id,planned->>'label',planned_position,coalesce((planned->>'confirmed')::boolean,false));
    player_position := 0;
    for player_id in
      select element from jsonb_array_elements_text(coalesce(planned->'playerIds','[]'::jsonb)) as items(element)
    loop
      player_position := player_position + 1;
      insert into public.badminton_planned_match_players(match_id,room_id,player_id,position)
      values(p_id || ':' || (planned->>'id'),p_id,player_id,player_position);
    end loop;
  end loop;

  for activity in
    select element
    from jsonb_array_elements(coalesce(p_state->'activityLog','[]'::jsonb)) as items(element)
    where element->>'action' in ('mark-added','match-confirmed')
  loop
    activity_position := activity_position + 1;
    insert into public.badminton_match_events(id,room_id,action,message,created_at,position)
    values(
      activity->>'id', p_id, coalesce(activity->>'action','mark-added'),
      coalesce(activity->>'message',''), coalesce(nullif(activity->>'createdAt','')::timestamptz,now()),
      activity_position
    );
  end loop;

  update public.badminton_rooms set
    base_fee=coalesce((p_state->'pricing'->>'baseFee')::numeric,90),
    shuttle_fee=coalesce((p_state->'pricing'->>'shuttleFee')::numeric,26),
    current_shuttle_number=greatest(coalesce((p_state->>'currentShuttleNumber')::integer,1),1),
    revision=case when room.revision=1 and p_expected_revision=0 then 1 else room.revision+1 end,
    updated_at=now()
  where id=p_id returning * into room;

  return jsonb_build_object(
    'saved', true, 'revision', room.revision,
    'state', public.build_normalized_badminton_state(p_id),
    'updated_at', room.updated_at, 'closed_at', room.closed_at
  );
end $$;

create or replace function public.set_badminton_player_payment(
  p_room_id text,
  p_player_id text,
  p_paid boolean,
  p_paid_amount numeric default null,
  p_paid_account_id text default null,
  p_paid_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  room public.badminton_rooms%rowtype;
  normalized_account_id text;
begin
  select * into room from public.badminton_rooms where id=p_room_id for update;
  if not found or room.closed_at is not null then
    return jsonb_build_object(
      'saved', false, 'revision', coalesce(room.revision, 0),
      'state', case when room.id is null then null else public.build_normalized_badminton_state(p_room_id) end,
      'updated_at', coalesce(room.updated_at, now()),
      'closed_at', room.closed_at
    );
  end if;

  if not exists (
    select 1 from public.badminton_players
    where room_id=p_room_id and id=p_player_id
  ) then
    return jsonb_build_object(
      'saved', false, 'revision', room.revision,
      'state', public.build_normalized_badminton_state(p_room_id),
      'updated_at', room.updated_at, 'closed_at', room.closed_at
    );
  end if;

  normalized_account_id := case
    when p_paid and p_paid_account_id in ('gsb','kasikorn') then p_paid_account_id
    when p_paid then 'gsb'
    else null
  end;

  update public.badminton_players set
    paid=coalesce(p_paid,false),
    paid_at=case when coalesce(p_paid,false) then coalesce(p_paid_at, now()) else null end,
    paid_amount=case when coalesce(p_paid,false) then greatest(coalesce(p_paid_amount,0),0) else null end,
    paid_account_id=normalized_account_id
  where room_id=p_room_id and id=p_player_id;

  if coalesce(p_paid,false) then
    delete from public.badminton_planned_match_players
    where room_id=p_room_id and player_id=p_player_id;
  end if;

  update public.badminton_rooms set
    revision=revision+1,
    updated_at=now()
  where id=p_room_id returning * into room;

  return jsonb_build_object(
    'saved', true, 'revision', room.revision,
    'state', public.build_normalized_badminton_state(p_room_id),
    'updated_at', room.updated_at, 'closed_at', room.closed_at
  );
end $$;

-- The current app uses an anonymous publishable key, so only its four
-- snapshot/room RPCs are exposed. Add Supabase Auth before tightening access.
revoke all on function public.close_normalized_badminton_room(text) from public, anon;
revoke all on function public.delete_normalized_badminton_room(text) from public, anon;
revoke all on function public.build_normalized_badminton_state(text) from public, anon;
revoke all on function public.load_normalized_badminton_session(text) from public, anon;
revoke all on function public.save_normalized_badminton_session(text,jsonb,bigint) from public, anon;
revoke all on function public.set_badminton_player_payment(text,text,boolean,numeric,text,timestamptz) from public, anon;
revoke all on function public.upsert_badminton_room_dashboard_snapshot(text,timestamptz,integer,integer,integer,numeric,jsonb,jsonb,jsonb) from public, anon;
revoke all on function public.list_badminton_room_dashboard_snapshots() from public, anon;
revoke all on function public.get_badminton_payment_settings() from public, anon;
revoke all on function public.set_badminton_payment_account(text) from public, anon;

grant execute on function public.load_normalized_badminton_session(text) to anon;
grant execute on function public.save_normalized_badminton_session(text,jsonb,bigint) to anon;
grant execute on function public.set_badminton_player_payment(text,text,boolean,numeric,text,timestamptz) to anon;
grant execute on function public.close_normalized_badminton_room(text) to anon;
grant execute on function public.delete_normalized_badminton_room(text) to anon;
grant execute on function public.upsert_badminton_room_dashboard_snapshot(text,timestamptz,integer,integer,integer,numeric,jsonb,jsonb,jsonb) to anon;
grant execute on function public.list_badminton_room_dashboard_snapshots() to anon;
grant execute on function public.get_badminton_payment_settings() to anon;
grant execute on function public.set_badminton_payment_account(text) to anon;
