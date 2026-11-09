-- General-purpose application settings (key/value).
-- Run this in the Supabase SQL Editor.
--
-- NOTE: rows are readable with the public anon key, so never store secrets here.

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Keep updated_at current on every update
create or replace function public.app_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.app_settings_set_updated_at();

-- Permissions: everyone may read, nobody may write through the public API.
-- Writes happen from the Supabase dashboard / SQL editor, or from the server
-- using the service_role key (which bypasses RLS).
alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

drop policy if exists "app_settings are readable by everyone" on public.app_settings;
create policy "app_settings are readable by everyone"
  on public.app_settings
  as permissive
  for select
  to anon, authenticated
  using (true);

-- Seed: current kingshot.net Server Action id for the player lookup
insert into public.app_settings (key, value, description)
values (
  'kingshot_redeem_action_id',
  to_jsonb('401816bdd6ebcfd1700fae80caafc02d3a0f16ba7b'::text),
  'Next-Action id of the kingshot.net "lookupPlayer" Server Action (rotates when kingshot.net redeploys)'
)
on conflict (key) do nothing;

-- To update a value manually:
-- update public.app_settings
--   set value = to_jsonb('<new id>'::text)
--   where key = 'kingshot_redeem_action_id';
