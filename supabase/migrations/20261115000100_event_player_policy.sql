-- event_player had RLS on but no policy, so the app (anon key) read no rows and couldn't write.
-- Gives it the same access as alliance_event by copying AllianceEventPolicy's rules.
-- Run once in the Supabase SQL editor.

alter table event_player enable row level security;

do $$
declare
  using_expr text;
  check_expr text;
begin
  select qual, with_check into using_expr, check_expr
  from pg_policies
  where tablename = 'alliance_event' and policyname = 'AllianceEventPolicy';

  if not found then
    raise exception 'AllianceEventPolicy not found on alliance_event';
  end if;

  drop policy if exists "EventPlayerPolicy" on event_player;
  execute format(
    'create policy "EventPlayerPolicy" on event_player for all to public using (%s) with check (%s)',
    coalesce(using_expr, 'true'),
    coalesce(check_expr, using_expr, 'true')
  );
end $$;

-- Check: both tables should now list a policy with the same rules
-- select tablename, policyname, cmd, roles, qual, with_check from pg_policies
-- where tablename in ('event_player', 'alliance_event');
