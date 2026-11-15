-- Estimated powers for past events that have none recorded (run after 20261115000200).
--
-- For every player in an event that already started, with nothing in player_power_history
-- before that start: one history row just before their earliest such event, with
--   Swordland power = current Swordland power - 100
--   Power           = current Power - 150 000
--   Tri Alliance    = not estimated (null)
-- Swordland event_player rows without a saved power get the same estimate (in the event's
-- power mode). Safe to run again: players that have a record before the event are skipped.

begin;

-- 1. One estimated history row per player, just before their earliest past event without one
insert into public.player_power_history ("playerId", power, "swordlandPower", "trialliancePower", "recordedAt")
select
  p.id,
  greatest(p.power - 150000, 0),
  greatest(p."swordlandPower" - 100, 0),
  null,
  missing.first_start - interval '1 second'
from (
  select ep."playerId" as player_id, min(ae."startsAt"::timestamptz) as first_start
  from public.event_player ep
  join public.alliance_event ae on ae.id = ep.alliance_event_id
  where ep."playerId" is not null
    and ae."startsAt" is not null
    and ae."startsAt"::timestamptz <= now()
    and not exists (
      select 1 from public.player_power_history h
      where h."playerId" = ep."playerId" and h."recordedAt" <= ae."startsAt"::timestamptz
    )
  group by ep."playerId"
) missing
join public.player p on p.id = missing.player_id;

-- 2. Swordland rows of past events without a saved power: the power in the event's mode
update public.event_player ep
set
  "powerAtEvent" = case
    when ae."powerMode" = 'power' then greatest(p.power - 150000, 0)
    else greatest(p."swordlandPower" - 100, 0)
  end,
  "powerType" = case when ae."powerMode" = 'power' then 'power' else 'swordland' end
from public.alliance_event ae, public.player p
where ae.id = ep.alliance_event_id
  and p.id = ep."playerId"
  and ae."eventId" = 1
  and ae."startsAt" is not null
  and ae."startsAt"::timestamptz <= now()
  and ep."powerAtEvent" is null;

commit;
