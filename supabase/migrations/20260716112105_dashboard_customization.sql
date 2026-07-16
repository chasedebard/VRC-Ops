-- Customizable Home dashboard, 2026-07-16.
--
-- Adds per-user, per-league dashboard layout storage for the website's new
-- tile-based Home screen, plus a small league_announcements table backing
-- the "League Announcements" tile (the one dashboard tile with no existing
-- data anywhere in the schema). Website-only feature; nothing here is
-- consumed by the native app. Both tables are fully additive — no existing
-- table, policy, or RPC is modified.

-- ─────────────────────────────────────────────────────────────────────────
-- dashboard_configs: one saved layout per (user, league, dashboard_key).
-- ─────────────────────────────────────────────────────────────────────────

create table public.dashboard_configs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  league_id      uuid not null references public.leagues(id) on delete cascade,
  dashboard_key  text not null default 'home',
  schema_version integer not null default 1,
  layout         jsonb not null check (jsonb_typeof(layout) = 'object'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, league_id, dashboard_key)
);

create index idx_dashboard_configs_user_league on public.dashboard_configs(user_id, league_id);

alter table public.dashboard_configs enable row level security;

-- Entirely user-scoped data — no co-league visibility is needed (unlike
-- memberships/profiles), so every policy is a plain user_id = auth.uid()
-- check. Insert/update additionally require active league membership so a
-- user can't stash a layout row under a league they don't belong to.
create policy dashboard_configs_select on public.dashboard_configs for select to authenticated
  using (user_id = auth.uid());

create policy dashboard_configs_insert on public.dashboard_configs for insert to authenticated
  with check (user_id = auth.uid() and public.vrc_is_league_member(league_id));

create policy dashboard_configs_update on public.dashboard_configs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.vrc_is_league_member(league_id));

create policy dashboard_configs_delete on public.dashboard_configs for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.dashboard_configs from anon;
grant select, insert, update, delete on public.dashboard_configs to authenticated;

create trigger trg_dashboard_configs_updated_at before update on public.dashboard_configs
  for each row execute function public.vrc_set_updated_at();

comment on table public.dashboard_configs is
  'Per-user, per-league saved Home dashboard tile layout for the website. Source of truth for the customizable dashboard; localStorage is only a paint cache.';

-- ─────────────────────────────────────────────────────────────────────────
-- league_announcements: owner/admin-authored posts, readable by all members.
-- ─────────────────────────────────────────────────────────────────────────

create table public.league_announcements (
  id                    uuid primary key default gen_random_uuid(),
  league_id             uuid not null references public.leagues(id) on delete cascade,
  author_membership_id  uuid not null references public.memberships(id) on delete cascade,
  title                 text not null,
  body                  text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint league_announcements_title_not_blank check (btrim(title) <> ''),
  constraint league_announcements_body_not_blank check (btrim(body) <> '')
);

create index idx_league_announcements_league on public.league_announcements(league_id, created_at desc);

alter table public.league_announcements enable row level security;

-- Any active league member can read; only an owner/admin of that league can
-- write. No dedicated RPC needed — there's no concurrency invariant to
-- protect here (contrast with invitations/seats), so direct RLS-gated writes
-- are sufficient, same pattern as e.g. events/seasons row ownership checks.
create policy league_announcements_select on public.league_announcements for select to authenticated
  using (public.vrc_is_league_member(league_id));

create policy league_announcements_insert on public.league_announcements for insert to authenticated
  with check (
    public.vrc_can_manage_league(league_id)
    and exists (
      select 1 from public.memberships m
      where m.id = author_membership_id
        and m.league_id = league_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy league_announcements_update on public.league_announcements for update to authenticated
  using (public.vrc_can_manage_league(league_id))
  with check (public.vrc_can_manage_league(league_id));

create policy league_announcements_delete on public.league_announcements for delete to authenticated
  using (public.vrc_can_manage_league(league_id));

revoke all on public.league_announcements from anon;
grant select, insert, update, delete on public.league_announcements to authenticated;

create trigger trg_league_announcements_updated_at before update on public.league_announcements
  for each row execute function public.vrc_set_updated_at();

comment on table public.league_announcements is
  'Owner/admin-authored league announcements shown on the website League Announcements dashboard tile. Website-only, no native app usage.';

notify pgrst, 'reload schema';
