-- Bucket privado para fotos de observação.
-- Caminho: <organization_id>/<observation_id>/<photo_id>.jpg
-- O 1º segmento do caminho é a organização — as policies abaixo escopam
-- leitura/escrita a membros da org (organization_id vem do user_metadata
-- do JWT, mesmo mecanismo usado pelo RLS das tabelas).

insert into storage.buckets (id, name, public)
values ('observation-photos', 'observation-photos', false)
on conflict (id) do nothing;

create policy "org members insert observation photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] =
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
);

-- upsert (x-upsert) exige policy de update além do insert
create policy "org members update observation photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] =
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
)
with check (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] =
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
);

create policy "org members read observation photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] =
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
);
