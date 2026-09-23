-- Demonstração opcional para testes. Para os participantes reais desta edição,
-- prefira supabase/copa-2026-dados.sql.
insert into public.teams (name, team_type) values
('Arthur','SOLO'),('Bruno','SOLO'),('Caio','SOLO'),('Diego','SOLO'),
('Enzo','SOLO'),('Felipe Demo','SOLO'),('Gustavo Demo','SOLO'),('Heitor','SOLO')
on conflict (name) do nothing;

insert into public.competitions (name, kind, mode, season, active, format_config)
select 'Copa Demo','CUP','SOLO','2026',true,'{"groups":["1","2"],"qualifiers_per_group":2,"points_win":3,"points_draw":1,"points_loss":0,"points_loss_three_crowns":-1,"knockout_mode":"AUTO_CROSS"}'::jsonb
where not exists (select 1 from public.competitions where name='Copa Demo');

with c as (select id from public.competitions where name='Copa Demo' order by created_at limit 1),
p as (select id,name,row_number() over(order by name) n from public.teams where name in ('Arthur','Bruno','Caio','Diego','Enzo','Felipe Demo','Gustavo Demo','Heitor'))
insert into public.competition_entries(competition_id,participant_id,group_label)
select c.id,p.id,case when p.n<=4 then '1' else '2' end from c,p
on conflict (competition_id,participant_id) do update set group_label=excluded.group_label;
