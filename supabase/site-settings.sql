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
