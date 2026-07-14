-- Bucket PÚBLICO para assets de mapa (estilo satélite usado pelo download
-- offline do MapLibre — o módulo nativo exige o estilo numa URL).
-- O app publica/atualiza o JSON sozinho (upsert idempotente, ~1 KB).

insert into storage.buckets (id, name, public)
values ('map-assets', 'map-assets', true)
on conflict (id) do nothing;

create policy "map assets public read"
on storage.objects for select
using (bucket_id = 'map-assets');

create policy "authenticated write map assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'map-assets');

create policy "authenticated update map assets"
on storage.objects for update to authenticated
using (bucket_id = 'map-assets')
with check (bucket_id = 'map-assets');
