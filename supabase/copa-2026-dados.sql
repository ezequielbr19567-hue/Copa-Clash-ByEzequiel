-- COPA 2026 — 20 PARTICIPANTES / 4 GRUPOS
-- Execute DEPOIS de schema.sql (instalação nova) ou copa-v3-migration.sql (site existente).
-- Este script NÃO apaga o projeto Supabase, usuários ou aparência.
-- Ele limpa somente as partidas/inscrições da Copa ativa para deixar esta Copa pronta do zero.

do $$
declare
  cup_id uuid;
begin
  select id into cup_id
  from public.competitions
  where kind='CUP' and active=true
  order by created_at desc
  limit 1;

  if cup_id is null then
    insert into public.competitions (name,kind,mode,season,active,format_config)
    values ('Copa','CUP','SOLO','2026',true,'{"groups":["1","2","3","4"],"qualifiers_per_group":4,"points_win":3,"points_draw":0,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb)
    returning id into cup_id;
  else
    update public.competitions
    set mode='SOLO',
        format_config='{"groups":["1","2","3","4"],"qualifiers_per_group":4,"points_win":3,"points_draw":0,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb
    where id=cup_id;
  end if;

  -- Garante que esta seja a única Copa ativa exibida no site.
  update public.competitions set active=false where kind='CUP' and id<>cup_id;
  update public.competitions set active=true where id=cup_id;

  -- Limpa somente a tabela esportiva desta Copa ativa.
  delete from public.matches where competition_id=cup_id;
  delete from public.competition_entries where competition_id=cup_id;

  insert into public.teams (name,team_type) values
    ('Marko','SOLO'),('Gabriel','SOLO'),('Fagner','SOLO'),('Alemão','SOLO'),('Jorge','SOLO'),
    ('Thiago','SOLO'),('Lucas Borba','SOLO'),('Emanuel','SOLO'),('Josué','SOLO'),('Joao Gabriel','SOLO'),
    ('João Beretta','SOLO'),('Willian','SOLO'),('Felipe','SOLO'),('Antony','SOLO'),('Miranha','SOLO'),
    ('Ezequiel','SOLO'),('Erick','SOLO'),('Gustavo Barboza','SOLO'),('Victor','SOLO'),('Lucas Brum','SOLO')
  on conflict (name) do update set team_type='SOLO';

  insert into public.competition_entries (competition_id,participant_id,group_label)
  select cup_id,id,'1' from public.teams where name in ('Marko','Gabriel','Fagner','Alemão','Jorge')
  on conflict (competition_id,participant_id) do update set group_label=excluded.group_label;

  insert into public.competition_entries (competition_id,participant_id,group_label)
  select cup_id,id,'2' from public.teams where name in ('Thiago','Lucas Borba','Emanuel','Josué','Joao Gabriel')
  on conflict (competition_id,participant_id) do update set group_label=excluded.group_label;

  insert into public.competition_entries (competition_id,participant_id,group_label)
  select cup_id,id,'3' from public.teams where name in ('João Beretta','Willian','Felipe','Antony','Miranha')
  on conflict (competition_id,participant_id) do update set group_label=excluded.group_label;

  insert into public.competition_entries (competition_id,participant_id,group_label)
  select cup_id,id,'4' from public.teams where name in ('Ezequiel','Erick','Gustavo Barboza','Victor','Lucas Brum')
  on conflict (competition_id,participant_id) do update set group_label=excluded.group_label;
end $$;
