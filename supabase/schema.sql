-- CLASH DA TURMA — banco de dados Supabase/PostgreSQL
-- Execute este arquivo inteiro em: Supabase > SQL Editor > New query

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_type text not null check (team_type in ('SOLO', 'DUO')),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  position smallint not null default 1 check (position between 1 and 2),
  primary key (team_id, player_id),
  unique (team_id, position)
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('LEAGUE', 'CUP')),
  mode text not null check (mode in ('SOLO', 'DUO')),
  season text not null default extract(year from now())::text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cup_must_be_duo check (kind <> 'CUP' or mode = 'DUO')
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_label text not null,
  participant_a uuid not null references public.teams(id) on delete restrict,
  participant_b uuid not null references public.teams(id) on delete restrict,
  scheduled_at timestamptz,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'FINISHED')),
  crowns_a smallint check (crowns_a between 0 and 3),
  crowns_b smallint check (crowns_b between 0 and 3),
  notes text,
  created_at timestamptz not null default now(),
  constraint different_participants check (participant_a <> participant_b),
  constraint finished_has_score check (
    status <> 'FINISHED' or (crowns_a is not null and crowns_b is not null)
  )
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



-- Validações extras: participantes precisam ter o mesmo modo da competição
-- e uma partida finalizada da Copa não pode terminar empatada.
create or replace function public.validate_match_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  competition_kind text;
  competition_mode text;
  team_a_mode text;
  team_b_mode text;
  team_a_members integer;
  team_b_members integer;
begin
  select kind, mode into competition_kind, competition_mode
  from public.competitions where id = new.competition_id;

  select team_type into team_a_mode from public.teams where id = new.participant_a;
  select team_type into team_b_mode from public.teams where id = new.participant_b;

  if team_a_mode is distinct from competition_mode or team_b_mode is distinct from competition_mode then
    raise exception 'Os participantes precisam ter o mesmo modo da competição.';
  end if;

  if competition_mode = 'DUO' then
    select count(*) into team_a_members from public.team_members where team_id = new.participant_a;
    select count(*) into team_b_members from public.team_members where team_id = new.participant_b;
    if team_a_members <> 2 or team_b_members <> 2 then
      raise exception 'Em partidas 2v2, cada equipe precisa ter exatamente dois jogadores.';
    end if;
  end if;

  if competition_kind = 'CUP' and new.status = 'FINISHED' and new.crowns_a = new.crowns_b then
    raise exception 'Partida eliminatória da Copa não pode terminar empatada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_match_rules on public.matches;
create trigger trg_validate_match_rules
before insert or update on public.matches
for each row execute function public.validate_match_rules();

create index if not exists idx_matches_competition on public.matches(competition_id);
create index if not exists idx_matches_status on public.matches(status);
create index if not exists idx_match_games_match on public.match_games(match_id);

-- Função segura usada pelas políticas de acesso.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.competitions enable row level security;
alter table public.matches enable row level security;
alter table public.match_games enable row level security;

-- O próprio usuário autenticado pode ler seu perfil.
drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles
for select to authenticated
using (id = auth.uid());

-- Visitantes podem ler os dados públicos do campeonato.
drop policy if exists "public players read" on public.players;
create policy "public players read" on public.players for select to anon, authenticated using (true);

drop policy if exists "public teams read" on public.teams;
create policy "public teams read" on public.teams for select to anon, authenticated using (true);

drop policy if exists "public team members read" on public.team_members;
create policy "public team members read" on public.team_members for select to anon, authenticated using (true);

drop policy if exists "public competitions read" on public.competitions;
create policy "public competitions read" on public.competitions for select to anon, authenticated using (true);

drop policy if exists "public matches read" on public.matches;
create policy "public matches read" on public.matches for select to anon, authenticated using (true);

drop policy if exists "public match games read" on public.match_games;
create policy "public match games read" on public.match_games for select to anon, authenticated using (true);

-- Apenas usuários com profiles.role = admin podem criar/editar/apagar.
drop policy if exists "admins manage players" on public.players;
create policy "admins manage players" on public.players for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage teams" on public.teams;
create policy "admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage team members" on public.team_members;
create policy "admins manage team members" on public.team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competitions" on public.competitions;
create policy "admins manage competitions" on public.competitions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage matches" on public.matches;
create policy "admins manage matches" on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage match games" on public.match_games;
create policy "admins manage match games" on public.match_games for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- IMPORTANTE:
-- Depois de criar um usuário em Authentication > Users, torne-o admin com:
--
-- insert into public.profiles (id, display_name, role)
-- select id, 'Administrador', 'admin'
-- from auth.users
-- where email = 'SEU_EMAIL_AQUI'
-- on conflict (id) do update set role = 'admin';

-- Permissões SQL explícitas; as políticas RLS acima continuam decidindo quais linhas podem ser acessadas.
grant select on public.players, public.teams, public.team_members, public.competitions, public.matches, public.match_games to anon, authenticated;
grant insert, update, delete on public.players, public.teams, public.team_members, public.competitions, public.matches, public.match_games to authenticated;
grant select on public.profiles to authenticated;

-- Cria automaticamente um perfil comum quando um novo usuário é criado no Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
-- Execute uma vez em bancos existentes. Em novos projetos, use schema.sql.
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
