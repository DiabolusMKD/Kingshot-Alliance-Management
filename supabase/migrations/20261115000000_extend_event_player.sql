-- Event data out of JSON into real columns.
--
--   alliance_event : per-legion result / MVP / start time + powerMode as columns;
--                    notes becomes a plain-text note of the event's creator;
--                    assignments (JSON) is only read here and no longer written by the app.
--   event_player   : one row per player per event - the only saved copy of the assignments.
--                    The player's alliance/kingdom are stored as they were when the player was
--                    added and never overwritten (players change alliances and kingdoms).
--
-- Run once in the Supabase SQL editor, in one go (it's a single transaction).

begin;

-- notes / assignments may hold plain text: parse without failing the migration
create or replace function pg_temp.try_jsonb(value text) returns jsonb
language plpgsql immutable as $$
begin
  return value::jsonb;
exception when others then
  return null;
end;
$$;

-- Foreign key columns get the exact type of the column they point to (player.id / alliance.id)
create or replace function pg_temp.column_type(tbl regclass, col text) returns text
language sql stable as $$
  select format_type(a.atttypid, a.atttypmod)
  from pg_attribute a
  where a.attrelid = tbl and a.attname = col and not a.attisdropped;
$$;

-- Drops every foreign key on one column (so it can be re-created with the right ON DELETE)
create or replace function pg_temp.drop_column_fks(tbl regclass, col text) returns void
language plpgsql as $$
declare
  fk text;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = tbl and c.contype = 'f' and a.attname = col
  loop
    execute format('alter table %s drop constraint %I', tbl, fk);
  end loop;
end;
$$;

-- 1. alliance_event: legion data as columns -------------------------------------------------

alter table alliance_event
  add column if not exists "powerMode"        text check ("powerMode" in ('swordland', 'power')),
  add column if not exists "legion1StartTime" text,   -- '14:00' (UTC); the weekday comes from startsAt
  add column if not exists "legion2StartTime" text,
  add column if not exists "legion1Result"    text,   -- 'win' | 'lose' | '1st' | '2nd' | '3rd'
  add column if not exists "legion2Result"    text;

do $$
declare
  player_id_type text := pg_temp.column_type('player', 'id');
begin
  -- MVP of each legion (player.id)
  execute format('alter table alliance_event add column if not exists "legion1Mvp" %s references player(id) on delete set null', player_id_type);
  execute format('alter table alliance_event add column if not exists "legion2Mvp" %s references player(id) on delete set null', player_id_type);
end $$;

-- 2. event_player: one row per player per event --------------------------------------------

-- "playerId" -> player.id; kept (NULL) when the player is deleted so the event history stays
alter table event_player alter column "playerId" drop not null;
select pg_temp.drop_column_fks('event_player', 'playerId');
-- NOT VALID: only checked for new rows, in case the (unused) table holds old rows
alter table event_player
  add constraint event_player_player_id_fkey
  foreign key ("playerId") references player(id) on delete set null not valid;

do $$
begin
  -- The player's alliance when added to the event (never overwritten)
  execute format(
    'alter table event_player add column if not exists "playerAllianceId" %s references alliance(id) on delete set null',
    pg_temp.column_type('alliance', 'id')
  );
end $$;

alter table event_player
  add column if not exists "playerName"       text,     -- name when added (shown if the player is deleted)
  add column if not exists "playerKingdomId"  bigint,   -- kingdom at the time
  add column if not exists "legion"           text check ("legion" in ('legion_1', 'legion_2')),
  add column if not exists "isSubstitute"     boolean not null default false,
  add column if not exists "position"         text,     -- Swordland building / Tri Alliance team, e.g. 'Bell Tower', 'Team 2'
  add column if not exists "positionRole"     text check ("positionRole" in ('leader', 'support', 'offense')),
  add column if not exists "powerAtEvent"     bigint,
  add column if not exists "powerType"        text check ("powerType" in ('swordland', 'power', 'tri_alliance'));
-- Kept: score (points), "didShowUp" (score > 0 on completed events), notes, "createdAt", "updatedAt".

-- Only deleting the event removes its rows
select pg_temp.drop_column_fks('event_player', 'alliance_event_id');
alter table event_player
  add constraint event_player_alliance_event_id_fkey
  foreign key (alliance_event_id) references alliance_event(id) on delete cascade not valid;

create unique index if not exists event_player_event_player_uq on event_player (alliance_event_id, "playerId");
create index if not exists event_player_player_idx on event_player ("playerId");

-- 3. Backfill event_player from the assignments + notes JSON --------------------------------

with events as (
  select
    ae.*,
    pg_temp.try_jsonb(ae.assignments::text) as assignments_json,
    pg_temp.try_jsonb(ae.notes::text)       as notes_json
  from alliance_event ae
),
rows as (
  select
    e.id                 as event_id,
    e."eventId"          as event_type_id,
    e."allianceId"       as host_alliance_id,
    e.status             as event_status,
    e."eventVariant"     as event_variant,
    e.notes_json         as notes,
    a                    as assignment,
    p.id                 as player_id,
    p.name               as player_name,
    p."allianceId"       as player_alliance_id,
    p."kingdomId"        as player_kingdom_id,
    -- legion1 / substitute_legion1 / substituteLegion1 -> legion_1
    case
      when replace(lower(a->>'legion'), '_', '') like '%legion1' then 'legion_1'
      when replace(lower(a->>'legion'), '_', '') like '%legion2' then 'legion_2'
    end                  as legion,
    lower(a->>'legion') like 'substitute%' as is_substitute
  from events e
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(e.assignments_json) = 'array' then e.assignments_json else '[]'::jsonb end
  ) a
  join player p on p.id::text = a->>'playerId'
),
scored as (
  select
    r.*,
    (
      select round((pp->>r.player_id::text)::numeric)::int
      from jsonb_array_elements(
        case when jsonb_typeof(r.notes) = 'object' then
          coalesce(r.notes->'legion_1'->'players_points', '[]'::jsonb)
          || coalesce(r.notes->'legion_2'->'players_points', '[]'::jsonb)
        else '[]'::jsonb end
      ) pp
      where pp ? r.player_id::text
      limit 1
    ) as score
  from rows r
  where r.legion is not null
)
insert into event_player (
  "playerId", "playerName", alliance_event_id, "playerAllianceId", "playerKingdomId",
  "legion", "isSubstitute", "powerAtEvent", "powerType", score, "didShowUp", "createdAt", "updatedAt"
)
select distinct on (s.event_id, s.player_id)
  s.player_id,
  coalesce(s.assignment->>'name', s.player_name),
  s.event_id,
  -- History wasn't stored: the host alliance for normal events, the current alliance for SSL guests
  case
    when s.event_variant = 'sls' and s.player_alliance_id is not null then s.player_alliance_id::text::bigint
    else s.host_alliance_id::text::bigint
  end,
  s.player_kingdom_id::text::bigint,
  s.legion,
  s.is_substitute,
  -- Old assignments saved Swordland power (Swordland) / Tri Alliance power (Tri Alliance)
  nullif(case
    when s.event_type_id = 2 then coalesce(s.assignment->>'triAlliancePower', s.assignment->>'power')
    else s.assignment->>'power'
  end, '')::numeric::bigint,
  case when s.event_type_id = 2 then 'tri_alliance' else 'swordland' end,
  s.score,
  case when s.event_status = 'completed' then coalesce(s.score, 0) > 0 end,
  now(),
  now()
from scored s
order by s.event_id, s.player_id
on conflict (alliance_event_id, "playerId") do nothing;

-- 4. Move results / MVPs / start times / power mode out of notes; notes becomes plain text ---

with parsed as (
  select id, pg_temp.try_jsonb(notes::text) as n
  from alliance_event
)
update alliance_event ae
set
  "powerMode"        = case when p.n->>'powerMode' in ('swordland', 'power') then p.n->>'powerMode' end,
  "legion1StartTime" = p.n #>> '{legionSchedule,legion_1,time}',
  "legion2StartTime" = p.n #>> '{legionSchedule,legion_2,time}',
  "legion1Result"    = p.n #>> '{legion_1,status}',
  "legion2Result"    = p.n #>> '{legion_2,status}',
  "legion1Mvp"       = (select pl.id from player pl where pl.id::text = p.n #>> '{legion_1,mvp}'),
  "legion2Mvp"       = (select pl.id from player pl where pl.id::text = p.n #>> '{legion_2,mvp}'),
  -- Only a plain-text note is kept (it was stored under "text" next to the results)
  notes              = nullif(p.n->>'text', '')
from parsed p
where p.id = ae.id and jsonb_typeof(p.n) = 'object';

commit;

-- Checks:
-- select count(*) as rows, count(score) as scored, count(distinct alliance_event_id) as events from event_player;
-- select id, "legion1Result", "legion2Result", "legion1StartTime", "powerMode", notes from alliance_event order by id desc limit 10;
