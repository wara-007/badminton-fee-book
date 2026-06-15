begin;

create schema if not exists badminton_normalized_archive;

do $$
declare
  table_name text;
  archived_name text;
begin
  foreach table_name in array array[
    'badminton_planned_match_players',
    'badminton_shuttle_marks',
    'badminton_planned_matches',
    'badminton_players',
    'badminton_rooms'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      archived_name := table_name || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
      execute format(
        'alter table public.%I set schema badminton_normalized_archive',
        table_name
      );
      execute format(
        'alter table badminton_normalized_archive.%I rename to %I',
        table_name,
        archived_name
      );
    end if;
  end loop;
end $$;

drop function if exists public.update_badminton_player_payment(text,text,boolean,numeric);
drop function if exists public.confirm_badminton_match(text,integer,text[],timestamptz);
drop function if exists public.create_badminton_room(text);
drop function if exists public.upsert_badminton_player(text,text,text,text,timestamptz,timestamptz,integer);
drop function if exists public.delete_badminton_player(text,text);
drop function if exists public.replace_badminton_player_marks(text,text,integer[]);
drop function if exists public.replace_badminton_planned_match(text,text,text,integer,boolean,text[]);
drop function if exists public.update_badminton_room_settings(text,numeric,numeric,integer);
drop function if exists public.clear_badminton_room(text,boolean);
drop function if exists public.close_normalized_badminton_room(text);
drop function if exists public.delete_normalized_badminton_room(text);
drop function if exists public.build_normalized_badminton_state(text);
drop function if exists public.load_normalized_badminton_session(text);
drop function if exists public.save_normalized_badminton_session(text,jsonb,bigint);

commit;
