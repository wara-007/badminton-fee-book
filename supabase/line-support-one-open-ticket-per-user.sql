do $$
declare
  duplicate_pair record;
begin
  for duplicate_pair in
    select
      closed_thread.id as keep_id,
      open_thread.id as merge_id
    from public.badminton_line_support_threads closed_thread
    join public.badminton_line_support_threads open_thread
      on open_thread.requester_user_id = closed_thread.requester_user_id
      and open_thread.status = 'open'
      and closed_thread.status = 'closed'
      and closed_thread.assigned_admin_user_id is not null
      and abs(extract(epoch from (
        open_thread.created_at - closed_thread.created_at
      ))) <= 5
  loop
    update public.badminton_line_support_messages
    set thread_id = duplicate_pair.keep_id
    where thread_id = duplicate_pair.merge_id;

    delete from public.badminton_line_support_reply_states
    where thread_id = duplicate_pair.merge_id;

    delete from public.badminton_line_support_threads
    where id = duplicate_pair.merge_id;

    update public.badminton_line_support_threads
    set status = 'open',
        closed_at = null,
        updated_at = now()
    where id = duplicate_pair.keep_id;
  end loop;
end;
$$;

do $$
declare
  duplicate_group record;
  duplicate_id uuid;
begin
  for duplicate_group in
    select
      requester_user_id,
      (
        array_agg(
          id
          order by
            (assigned_admin_user_id is not null) desc,
            created_at asc
        )
      )[1] as keep_id,
      array_agg(id) as all_ids
    from public.badminton_line_support_threads
    where status = 'open'
    group by requester_user_id
    having count(*) > 1
  loop
    foreach duplicate_id in array duplicate_group.all_ids
    loop
      if duplicate_id <> duplicate_group.keep_id then
        update public.badminton_line_support_messages
        set thread_id = duplicate_group.keep_id
        where thread_id = duplicate_id;

        delete from public.badminton_line_support_reply_states
        where thread_id = duplicate_id;

        delete from public.badminton_line_support_threads
        where id = duplicate_id;
      end if;
    end loop;

    update public.badminton_line_support_threads
    set updated_at = now()
    where id = duplicate_group.keep_id;
  end loop;
end;
$$;

drop index if exists public.badminton_line_support_threads_active_idx;

create unique index badminton_line_support_threads_one_open_per_user_idx
on public.badminton_line_support_threads (requester_user_id)
where status = 'open';

comment on index public.badminton_line_support_threads_one_open_per_user_idx is
  'Prevents concurrent LINE webhooks from creating multiple open tickets for one user.';
