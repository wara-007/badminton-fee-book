create table if not exists public.badminton_line_admins (
  user_id text primary key check (user_id like 'U%'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.badminton_line_admins enable row level security;
revoke all on public.badminton_line_admins from anon, authenticated;

create table if not exists public.badminton_line_admin_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id text not null check (requester_user_id like 'U%'),
  requester_display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists badminton_line_admin_requests_pending_idx
on public.badminton_line_admin_requests (requester_user_id)
where status = 'pending';

alter table public.badminton_line_admin_requests enable row level security;
revoke all on public.badminton_line_admin_requests from anon, authenticated;

create or replace function public.review_line_admin_request(
  p_request_id uuid,
  p_reviewer_user_id text,
  p_approve boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_row public.badminton_line_admin_requests%rowtype;
begin
  if not exists (
    select 1 from public.badminton_line_admins
    where user_id = p_reviewer_user_id and enabled
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into request_row
  from public.badminton_line_admin_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if request_row.status <> 'pending' then
    return jsonb_build_object(
      'status', 'already-reviewed',
      'requester_user_id', request_row.requester_user_id,
      'requester_display_name', request_row.requester_display_name
    );
  end if;

  if coalesce(p_approve, false) then
    insert into public.badminton_line_admins(user_id, enabled, updated_at)
    values(request_row.requester_user_id, true, now())
    on conflict (user_id) do update set enabled = true, updated_at = now();
  end if;

  update public.badminton_line_admin_requests
  set
    status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
    reviewed_by = p_reviewer_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'status', case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
    'requester_user_id', request_row.requester_user_id,
    'requester_display_name', request_row.requester_display_name
  );
end
$$;

revoke all on function public.review_line_admin_request(uuid,text,boolean)
from public, anon, authenticated;
grant execute on function public.review_line_admin_request(uuid,text,boolean)
to service_role;

create or replace function public.mark_badminton_player_paid_from_line(
  p_room_id text,
  p_player_id text,
  p_paid_account_id text,
  p_line_admin_user_id text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  room public.badminton_rooms%rowtype;
  player public.badminton_players%rowtype;
  payment_amount numeric;
  shuttle_count integer;
begin
  select * into room
  from public.badminton_rooms
  where id = p_room_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if room.closed_at is not null then
    return jsonb_build_object('status', 'room-closed');
  end if;

  select * into player
  from public.badminton_players
  where room_id = p_room_id and id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  select count(*)::integer into shuttle_count
  from public.badminton_shuttle_marks
  where room_id = p_room_id and player_id = p_player_id;
  payment_amount := room.base_fee + shuttle_count * room.shuttle_fee;

  if player.paid then
    return jsonb_build_object(
      'status', 'already-paid',
      'player_name', player.name,
      'amount', coalesce(player.paid_amount, payment_amount)
    );
  end if;

  update public.badminton_players
  set
    paid = true,
    paid_at = now(),
    paid_amount = payment_amount,
    paid_account_id = case
      when p_paid_account_id in ('gsb', 'kasikorn') then p_paid_account_id
      else 'gsb'
    end,
    updated_at = now()
  where room_id = p_room_id and id = p_player_id;

  delete from public.badminton_planned_match_players
  where room_id = p_room_id and player_id = p_player_id;

  update public.badminton_rooms
  set revision = revision + 1, updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'status', 'paid',
    'player_name', player.name,
    'amount', payment_amount,
    'line_admin_user_id', p_line_admin_user_id
  );
end
$$;

revoke all on function public.mark_badminton_player_paid_from_line(text,text,text,text)
from public, anon, authenticated;
grant execute on function public.mark_badminton_player_paid_from_line(text,text,text,text)
to service_role;
