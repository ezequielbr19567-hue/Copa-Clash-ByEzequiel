-- Atualização opcional dos formatos persistidos; o site já aplica 1 ponto.
update public.competitions
set format_config = jsonb_set(coalesce(format_config, '{}'::jsonb), '{points_draw}', '1'::jsonb)
where kind = 'CUP';
