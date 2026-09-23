-- COPA — Supabase/PostgreSQL (instalação nova)
-- Execute este arquivo inteiro no SQL Editor uma única vez.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);

-- Nome técnico mantido por compatibilidade. Cada registro é um participante individual.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_type text not null default 'SOLO' check (team_type = 'SOLO'),
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'CUP' check (kind = 'CUP'),
  mode text not null default 'SOLO' check (mode = 'SOLO'),
  season text not null default extract(year from now())::text,
  active boolean not null default true,
  format_config jsonb not null default '{"groups":["1","2","3","4"],"qualifiers_per_group":4,"points_win":3,"points_draw":0,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb check (jsonb_typeof(format_config)='object'),
  created_at timestamptz not null default now()
);

create table if not exists public.competition_entries (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.teams(id) on delete cascade,
  group_label text not null check (length(trim(group_label)) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (competition_id, participant_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  stage_type text not null default 'KNOCKOUT' check (stage_type in ('GROUP','KNOCKOUT')),
  group_label text,
  round_label text not null,
  participant_a uuid not null references public.teams(id) on delete restrict,
  participant_b uuid not null references public.teams(id) on delete restrict,
  scheduled_at timestamptz,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'FINISHED')),
  crowns_a smallint check (crowns_a between 0 and 3),
  crowns_b smallint check (crowns_b between 0 and 3),
  victory_time_seconds integer check (victory_time_seconds is null or victory_time_seconds between 1 and 3600),
  video_url text check (video_url is null or video_url ~* '^https://'),
  notes text,
  bracket_key text,
  bracket_order integer check (bracket_order is null or bracket_order > 0),
  created_at timestamptz not null default now(),
  constraint different_participants check (participant_a <> participant_b),
  constraint finished_has_score check (status <> 'FINISHED' or (crowns_a is not null and crowns_b is not null)),
  constraint group_stage_has_group check (stage_type <> 'GROUP' or nullif(trim(group_label),'') is not null)
);

create table if not exists public.match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  game_number integer not null check (game_number > 0),
  crowns_a smallint not null check (crowns_a between 0 and 3),
  crowns_b smallint not null check (crowns_b between 0 and 3),
  notes text,
  created_at timestamptz not null default now(),
  unique (match_id, game_number)
);

create or replace function public.validate_match_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  competition_mode text;
  team_a_mode text;
  team_b_mode text;
  a_entry boolean;
  b_entry boolean;
begin
  select mode into competition_mode from public.competitions where id = new.competition_id;
  select team_type into team_a_mode from public.teams where id = new.participant_a;
  select team_type into team_b_mode from public.teams where id = new.participant_b;

  if competition_mode is distinct from 'SOLO' or team_a_mode is distinct from 'SOLO' or team_b_mode is distinct from 'SOLO' then
    raise exception 'A Copa aceita apenas participantes individuais.';
  end if;

  if new.stage_type = 'GROUP' then
    if nullif(trim(new.group_label),'') is null then raise exception 'Partidas da fase de grupos precisam informar o grupo.'; end if;
    select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_a and group_label=new.group_label) into a_entry;
    select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_b and group_label=new.group_label) into b_entry;
  else
    select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_a) into a_entry;
    select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_b) into b_entry;
  end if;

  if not a_entry or not b_entry then raise exception 'Os participantes precisam estar inscritos na Copa e, na fase de grupos, no mesmo grupo da partida.'; end if;
  if new.stage_type = 'KNOCKOUT' and new.status = 'FINISHED' and new.crowns_a = new.crowns_b then raise exception 'Partida de mata-mata não pode terminar empatada.'; end if;
  if new.crowns_a = new.crowns_b then new.victory_time_seconds := null; end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_match_rules on public.matches;
create trigger trg_validate_match_rules before insert or update on public.matches for each row execute function public.validate_match_rules();

create index if not exists idx_entries_competition on public.competition_entries(competition_id);
create index if not exists idx_entries_group on public.competition_entries(competition_id,group_label);
create index if not exists idx_matches_competition on public.matches(competition_id);
create index if not exists idx_matches_stage on public.matches(competition_id,stage_type,group_label);
create index if not exists idx_matches_status on public.matches(status);
create index if not exists idx_match_games_match on public.match_games(match_id);
create unique index if not exists idx_matches_bracket_key on public.matches(competition_id,bracket_key);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_games enable row level security;

drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "public teams read" on public.teams;
create policy "public teams read" on public.teams for select to anon, authenticated using (true);
drop policy if exists "public competitions read" on public.competitions;
create policy "public competitions read" on public.competitions for select to anon, authenticated using (true);
drop policy if exists "public competition entries read" on public.competition_entries;
create policy "public competition entries read" on public.competition_entries for select to anon, authenticated using (true);
drop policy if exists "public matches read" on public.matches;
create policy "public matches read" on public.matches for select to anon, authenticated using (true);
drop policy if exists "public match games read" on public.match_games;
create policy "public match games read" on public.match_games for select to anon, authenticated using (true);

drop policy if exists "admins manage teams" on public.teams;
create policy "admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage competitions" on public.competitions;
create policy "admins manage competitions" on public.competitions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage competition entries" on public.competition_entries;
create policy "admins manage competition entries" on public.competition_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage matches" on public.matches;
create policy "admins manage matches" on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage match games" on public.match_games;
create policy "admins manage match games" on public.match_games for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.teams, public.competitions, public.competition_entries, public.matches, public.match_games to anon, authenticated;
grant insert, update, delete on public.teams, public.competitions, public.competition_entries, public.matches, public.match_games to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object')
);
alter table public.site_settings enable row level security;
drop policy if exists "public settings read" on public.site_settings;
create policy "public settings read" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "admins manage settings" on public.site_settings;
create policy "admins manage settings" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
insert into public.site_settings (id, settings) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- Depois de criar o usuário em Authentication > Users, torne-o admin:
-- insert into public.profiles (id, display_name, role)
-- select id, 'Administrador', 'admin' from auth.users where email='SEU_EMAIL_AQUI'
-- on conflict (id) do update set role='admin';
