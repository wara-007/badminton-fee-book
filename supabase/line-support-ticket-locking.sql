alter table public.badminton_line_support_threads
  add column if not exists assigned_admin_user_id text
    check (assigned_admin_user_id is null or assigned_admin_user_id like 'U%'),
  add column if not exists assigned_admin_display_name text,
  add column if not exists assigned_at timestamptz;

create index if not exists badminton_line_support_threads_active_idx
on public.badminton_line_support_threads (requester_user_id, updated_at desc)
where status = 'open';

create or replace function public.claim_line_support_thread(
  p_thread_id uuid,
  p_admin_user_id text,
  p_admin_display_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_thread public.badminton_line_support_threads%rowtype;
begin
  select *
  into v_thread
  from public.badminton_line_support_threads
  where id = p_thread_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  if v_thread.status <> 'open' then
    return jsonb_build_object('status', 'closed');
  end if;

  if v_thread.assigned_admin_user_id is not null
    and v_thread.assigned_admin_user_id <> p_admin_user_id then
    return jsonb_build_object(
      'status', 'busy',
      'admin_name', coalesce(v_thread.assigned_admin_display_name, 'แอดมินอีกคน')
    );
  end if;

  update public.badminton_line_support_threads
  set assigned_admin_user_id = p_admin_user_id,
      assigned_admin_display_name = p_admin_display_name,
      assigned_at = coalesce(assigned_at, now()),
      updated_at = now()
  where id = p_thread_id;

  return jsonb_build_object(
    'status',
    case
      when v_thread.assigned_admin_user_id = p_admin_user_id then 'already-claimed'
      else 'claimed'
    end
  );
end;
$$;

revoke all on function public.claim_line_support_thread(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_line_support_thread(uuid, text, text)
to service_role;

comment on function public.claim_line_support_thread(uuid, text, text) is
  'Atomically assigns an open LINE support ticket to one authorized admin.';
