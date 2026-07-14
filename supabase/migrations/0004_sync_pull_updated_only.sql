-- Elimina o diagnostic error do WatermelonDB:
--   "Server wants client to create record X, but it already exists locally"
-- Causa: após um push, o próximo pull devolvia no bucket `created` os registros
-- que o PRÓPRIO cliente acabou de enviar (created_at > cursor). O protocolo do
-- WatermelonDB permite entregar tudo em `updated` — registros que o cliente não
-- conhece são criados silenciosamente, e os que conhece são atualizados.
-- (Ref: docs de sync do WatermelonDB, "created" é opcional.)

create or replace function public.sync_pull(last_pulled_at bigint default 0)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  is_first  boolean := coalesce(last_pulled_at, 0) = 0;
  lpa       timestamptz := to_timestamp(coalesce(last_pulled_at, 0)::double precision / 1000.0);
  server_ts bigint := (extract(epoch from now()) * 1000)::bigint;
  t         text;
  updated   jsonb;
  deleted   jsonb;
  changes   jsonb := '{}'::jsonb;
begin
  foreach t in array public.synced_tables() loop
    -- tudo que mudou desde o cursor (novos OU alterados) vai em `updated`
    execute format($f$
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'last_modified_at' - 'deleted_at')
        || jsonb_build_object(
             'created_at', (extract(epoch from r.created_at) * 1000)::bigint,
             'updated_at', (extract(epoch from r.updated_at) * 1000)::bigint)
      ), '[]'::jsonb)
      from (select * from public.%I
            where deleted_at is null and last_modified_at > $1) r
    $f$, t) into updated using lpa;

    if is_first then
      deleted := '[]'::jsonb;
    else
      execute format($f$
        select coalesce(jsonb_agg(id), '[]'::jsonb)
        from (select id from public.%I
              where deleted_at is not null and deleted_at > $1) r
      $f$, t) into deleted using lpa;
    end if;

    changes := changes || jsonb_build_object(
      t, jsonb_build_object('created', '[]'::jsonb, 'updated', updated, 'deleted', deleted));
  end loop;

  return jsonb_build_object('changes', changes, 'timestamp', server_ts);
end;
$$;
