-- COPA V3 — ATUALIZAÇÃO NÃO DESTRUTIVA
-- Para quem já está usando a versão anterior deste site.
-- NÃO apague o Supabase. Execute este arquivo uma vez no SQL Editor.

alter table public.competitions add column if not exists format_config jsonb not null default '{}'::jsonb;
alter table public.matches add column if not exists stage_type text not null default 'KNOCKOUT';
alter table public.matches add column if not exists group_label text;
alter table public.matches add column if not exists victory_time_seconds integer;
alter table public.matches add column if not exists video_url text;
alter table public.matches add column if not exists bracket_key text;
alter table public.matches add column if not exists bracket_order integer;

alter table public.competitions alter column format_config set default '{"groups":["1","2","3","4"],"qualifiers_per_group":4,"points_win":3,"points_draw":0,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb;

update public.competitions
set format_config = '{"points_win":3,"points_draw":0,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb || coalesce(format_config,'{}'::jsonb)
where kind='CUP';

create table if not exists public.competition_entries (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.teams(id) on delete cascade,
  group_label text not null check (length(trim(group_label)) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (competition_id, participant_id)
);

alter table public.competitions drop constraint if exists cup_must_be_duo;
alter table public.matches drop constraint if exists matches_stage_type_check;
alter table public.matches add constraint matches_stage_type_check check (stage_type in ('GROUP','KNOCKOUT'));
alter table public.matches drop constraint if exists group_stage_has_group;
alter table public.matches add constraint group_stage_has_group check (stage_type <> 'GROUP' or nullif(trim(group_label),'') is not null);
alter table public.matches drop constraint if exists matches_victory_time_check;
alter table public.matches add constraint matches_victory_time_check check (victory_time_seconds is null or victory_time_seconds between 1 and 3600);
alter table public.matches drop constraint if exists matches_video_url_check;
alter table public.matches add constraint matches_video_url_check check (video_url is null or video_url ~* '^https://');
alter table public.matches drop constraint if exists matches_bracket_order_check;
alter table public.matches add constraint matches_bracket_order_check check (bracket_order is null or bracket_order > 0);

create unique index if not exists idx_matches_bracket_key on public.matches(competition_id,bracket_key);
create index if not exists idx_entries_competition on public.competition_entries(competition_id);
create index if not exists idx_entries_group on public.competition_entries(competition_id,group_label);
create index if not exists idx_matches_stage on public.matches(competition_id,stage_type,group_label);

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
  a_entry boolean;
  b_entry boolean;
begin
  select kind, mode into competition_kind, competition_mode from public.competitions where id = new.competition_id;
  select team_type into team_a_mode from public.teams where id = new.participant_a;
  select team_type into team_b_mode from public.teams where id = new.participant_b;

  if competition_kind='CUP' and competition_mode='SOLO' then
    if team_a_mode is distinct from 'SOLO' or team_b_mode is distinct from 'SOLO' then raise exception 'A Copa aceita apenas participantes individuais.'; end if;
    if new.stage_type='GROUP' then
      if nullif(trim(new.group_label),'') is null then raise exception 'Partidas da fase de grupos precisam informar o grupo.'; end if;
      select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_a and group_label=new.group_label) into a_entry;
      select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_b and group_label=new.group_label) into b_entry;
    else
      select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_a) into a_entry;
      select exists(select 1 from public.competition_entries where competition_id=new.competition_id and participant_id=new.participant_b) into b_entry;
    end if;
    if not a_entry or not b_entry then raise exception 'Os participantes precisam estar inscritos na Copa e, na fase de grupos, no mesmo grupo.'; end if;
  end if;

  if competition_kind='CUP' and new.stage_type='KNOCKOUT' and new.status='FINISHED' and new.crowns_a=new.crowns_b then raise exception 'Partida de mata-mata não pode terminar empatada.'; end if;
  if new.crowns_a = new.crowns_b then new.victory_time_seconds := null; end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_match_rules on public.matches;
create trigger trg_validate_match_rules before insert or update on public.matches for each row execute function public.validate_match_rules();

alter table public.competition_entries enable row level security;
drop policy if exists "public competition entries read" on public.competition_entries;
create policy "public competition entries read" on public.competition_entries for select to anon, authenticated using (true);
drop policy if exists "admins manage competition entries" on public.competition_entries;
create policy "admins manage competition entries" on public.competition_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.competition_entries to anon, authenticated;
grant insert, update, delete on public.competition_entries to authenticated;
