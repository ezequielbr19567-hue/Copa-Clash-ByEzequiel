-- OPCIONAL: dados de exemplo para testar rapidamente.
-- Execute SOMENTE depois de schema.sql e somente se quiser uma demonstração.

insert into public.players (name) values
('Ezequiel'),('Lucas'),('Pedro'),('Gabriel'),('Arthur'),('Matheus'),('João'),('Rafael')
on conflict (name) do nothing;

insert into public.teams (name, team_type) values
('Ezequiel','SOLO'),('Lucas','SOLO'),('Pedro','SOLO'),('Gabriel','SOLO'),
('Reis da Arena','DUO'),('Fúria Royale','DUO'),('Elite 2v2','DUO'),('Sem Elixir','DUO')
on conflict (name) do nothing;

-- Competições de exemplo. O restante pode ser cadastrado pelo painel.
insert into public.competitions (name, kind, mode, season, active)
select 'Campeonato da Turma','LEAGUE','SOLO','2026',true
where not exists (select 1 from public.competitions where name='Campeonato da Turma');

insert into public.competitions (name, kind, mode, season, active)
select 'Copa da Turma','CUP','DUO','2026',true
where not exists (select 1 from public.competitions where name='Copa da Turma');
