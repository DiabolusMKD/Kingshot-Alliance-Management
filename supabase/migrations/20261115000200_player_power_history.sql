-- Player power history: every change of a player's Power / Swordland power / Tri Alliance
-- power is recorded, so an event can use each player's power just before it started.
--
--   player_power_history   one row per change (written by a trigger on player)
--   get_player_power_at()  latest recorded powers of some players at a given time
--
-- History starts now: each player gets one row with their current powers, dated at the
-- player's last update (the powers were already current then).

begin;

create or replace function pg_temp.column_type(tbl regclass, col text) returns text
language sql stable as $$
  select format_type(atttypid, atttypmod)
  from pg_attribute
  where attrelid = tbl and attname = col and not attisdropped
$$;

create or replace function pg_temp.has_column(tbl regclass, col text) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_attribute where attrelid = tbl and attname = col and not attisdropped
  )
$$;

-- 1. The table (id and power columns take their types from player)
do $$
begin
  execute format(
    $f$
    create table if not exists public.player_power_history (
      id bigint generated always as identity primary key,
      "playerId" %s not null references public.player(id) on delete cascade,
      power %s,
      "swordlandPower" %s,
      "trialliancePower" %s,
      "recordedAt" timestamptz not null default now()
    )
    $f$,
    pg_temp.column_type('public.player', 'id'),
    pg_temp.column_type('public.player', 'power'),
    pg_temp.column_type('public.player', 'swordlandPower'),
    pg_temp.column_type('public.player', 'trialliancePower')
  );
end $$;

create index if not exists player_power_history_player_time_idx
  on public.player_power_history ("playerId", "recordedAt" desc);

-- 2. Record a row when a player is created or one of their powers changes
create or replace function public.record_player_power() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.power, new."swordlandPower", new."trialliancePower")
       is not distinct from (old.power, old."swordlandPower", old."trialliancePower") then
      return new;
    end if;
  end if;

  insert into public.player_power_history ("playerId", power, "swordlandPower", "trialliancePower")
  values (new.id, new.power, new."swordlandPower", new."trialliancePower");
  return new;
end $$;

drop trigger if exists player_power_history_trigger on public.player;
create trigger player_power_history_trigger
  after insert or update of power, "swordlandPower", "trialliancePower" on public.player
  for each row execute function public.record_player_power();

-- 3. Current powers of every player (once), dated at their last update
do $$
declare
  recorded_at text := 'now()';
begin
  if pg_temp.has_column('public.player', 'created_at') then
    recorded_at := format('coalesce(p.created_at::timestamptz, %s)', recorded_at);
  end if;
  if pg_temp.has_column('public.player', 'updated_at') then
    recorded_at := format('coalesce(p.updated_at::timestamptz, %s)', recorded_at);
  end if;

  execute format(
    $f$
    insert into public.player_power_history ("playerId", power, "swordlandPower", "trialliancePower", "recordedAt")
    select p.id, p.power, p."swordlandPower", p."trialliancePower", least(%s, now())
    from public.player p
    where not exists (select 1 from public.player_power_history h where h."playerId" = p.id)
    $f$,
    recorded_at
  );
end $$;

-- 4. Latest recorded powers of the given players at a time (e.g. the event's start)
do $$
begin
  execute format(
    $f$
    create or replace function public.get_player_power_at(player_ids %s[], at_time timestamptz)
    returns setof public.player_power_history
    language sql stable security invoker set search_path = public as $body$
      select distinct on (h."playerId") h.*
      from public.player_power_history h
      where h."playerId" = any(player_ids) and h."recordedAt" <= at_time
      order by h."playerId", h."recordedAt" desc, h.id desc
    $body$
    $f$,
    pg_temp.column_type('public.player', 'id')
  );
end $$;

grant execute on function public.get_player_power_at to anon, authenticated;

-- 5. Readable like player; only the trigger writes
alter table public.player_power_history enable row level security;

do $$
declare
  read_rule text;
begin
  select qual into read_rule
  from pg_policies
  where schemaname = 'public' and tablename = 'player' and cmd in ('SELECT', 'ALL') and qual is not null
  order by (cmd = 'SELECT') desc
  limit 1;

  drop policy if exists "PlayerPowerHistoryRead" on public.player_power_history;
  execute format(
    'create policy "PlayerPowerHistoryRead" on public.player_power_history for select to public using (%s)',
    coalesce(read_rule, 'true')
  );
end $$;

commit;
