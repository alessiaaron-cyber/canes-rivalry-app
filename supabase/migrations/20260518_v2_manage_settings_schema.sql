-- V2 Manage Settings Schema
-- Milestone: v2-manage-settings-schema
--
-- Additive/backward-compatible migration for V1/V2 coexistence.
-- No legacy columns are removed or renamed.

-- =====================================================
-- seasons: configurable scoring + lock/override metadata
-- =====================================================

alter table public.seasons
  add column if not exists scoring_rules jsonb not null default '{
    "regular": {
      "goal": 2,
      "assist": 1,
      "first_goal_bonus": 1
    },
    "playoffs": {
      "goal": 2,
      "assist": 1,
      "first_goal_bonus": 1
    }
  }'::jsonb;

alter table public.seasons
  add column if not exists regular_scoring_locked boolean not null default false,
  add column if not exists playoff_scoring_locked boolean not null default false,
  add column if not exists regular_scoring_locked_at timestamptz null,
  add column if not exists playoff_scoring_locked_at timestamptz null,
  add column if not exists scoring_override_note text null,
  add column if not exists scoring_override_updated_at timestamptz null,
  add column if not exists scoring_override_updated_by uuid null;

create index if not exists idx_seasons_scoring_override_updated_by
  on public.seasons(scoring_override_updated_by);

-- =====================================================
-- user_settings: per-user app preferences
-- =====================================================

create table if not exists public.user_settings (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  stream_settings jsonb not null default '{
    "push_delay_seconds": 90,
    "toast_delay_seconds": 90
  }'::jsonb,
  notification_settings jsonb not null default '{
    "push_enabled": true,
    "toast_enabled": true
  }'::jsonb,
  ui_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_settings_updated_at
  on public.user_settings(updated_at);

-- Backfill settings for all existing profiles.
insert into public.user_settings (
  user_id,
  stream_settings,
  notification_settings,
  ui_settings
)
select
  p.id,
  '{"push_delay_seconds":90,"toast_delay_seconds":90}'::jsonb,
  '{"push_enabled":true,"toast_enabled":true}'::jsonb,
  '{}'::jsonb
from public.user_profiles p
on conflict (user_id) do nothing;

-- Keep updated_at current for user_settings.
create or replace function public.set_user_settings_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_settings_updated_at on public.user_settings;

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_user_settings_updated_at();

alter table public.user_settings enable row level security;

create policy "Users can read own settings"
  on public.user_settings
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own settings"
  on public.user_settings
  for insert
  to authenticated
  with check (user_id = auth.uid() and is_allowed_user());

create policy "Users can update own settings"
  on public.user_settings
  for update
  to authenticated
  using (user_id = auth.uid() and is_allowed_user())
  with check (user_id = auth.uid() and is_allowed_user());

create policy "Block delete user settings"
  on public.user_settings
  for delete
  to authenticated
  using (false);

-- =====================================================
-- push_subscriptions: prefer user_id while keeping user_email
-- =====================================================

alter table public.push_subscriptions
  add column if not exists user_id uuid null,
  add column if not exists updated_at timestamptz not null default now();

update public.push_subscriptions ps
set user_id = up.id
from public.user_profiles up
where ps.user_id is null
  and ps.user_email is not null
  and lower(ps.user_email) = lower(up.email);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

-- =====================================================
-- delayed_notifications: recipient-aware delayed push support
-- =====================================================

alter table public.delayed_notifications
  add column if not exists target_user_id uuid null,
  add column if not exists target_user_email text null;

-- Replace the legacy global event_key uniqueness with recipient-aware
-- uniqueness. Legacy/global delayed rows are still unique by event_key,
-- but targeted rows may queue once per recipient.
drop index if exists public.delayed_notifications_event_key_unique;

create unique index if not exists delayed_notifications_event_key_global_unique
  on public.delayed_notifications(event_key)
  where target_user_id is null and target_user_email is null;

create unique index if not exists delayed_notifications_event_key_target_user_unique
  on public.delayed_notifications(event_key, target_user_id)
  where target_user_id is not null;

create unique index if not exists delayed_notifications_event_key_target_email_unique
  on public.delayed_notifications(event_key, lower(target_user_email))
  where target_user_id is null and target_user_email is not null;

create index if not exists idx_delayed_notifications_target_user
  on public.delayed_notifications(target_user_id);

create index if not exists idx_delayed_notifications_target_email
  on public.delayed_notifications(lower(target_user_email));

-- Existing cleanup cron continues to cover delayed_notifications rows.
-- Existing V1 rows may have target_user_id/target_user_email null and should keep broadcast behavior.
