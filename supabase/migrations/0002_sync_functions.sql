-- =============================================================================
-- TenaMonitore — Funções de sincronização WatermelonDB <-> Supabase
-- =============================================================================
-- Protocolo WatermelonDB:
--   pullChanges({lastPulledAt}) -> { changes: { <tabela>: {created,updated,deleted} },
--                                    timestamp }
--   pushChanges({changes})      -> aplica created/updated (upsert) e deleted (soft delete)
--
-- São SECURITY INVOKER: rodam com o papel do usuário, então o RLS faz
-- automaticamente o escopo (admin = org inteira; consultor = fazendas atribuídas).
-- Convenções de timestamp:
--   - created_at / updated_at trafegam como epoch ms (number) p/ casar com @date do WDB
--   - colunas server-managed (last_modified_at, deleted_at) não vão p/ o cliente
--   - no push, timestamps de sync são ignorados (o servidor é a autoridade via trigger)
-- =============================================================================

-- Fonte única da lista de tabelas sincronizadas (ordem = pais antes de filhos,
-- importante p/ FKs e RLS no push).
create or replace function public.synced_tables()
returns text[] language sql immutable as $$
  select array[
    'organizations','profiles','crops','threats','farms','fields',
    'assignments','visits','observations','observation_photos',
    'recommendations','reports'
  ];
$$;

-- -----------------------------------------------------------------------------
-- PULL
-- -----------------------------------------------------------------------------
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
  created   jsonb;
  updated   jsonb;
  deleted   jsonb;
  changes   jsonb := '{}'::jsonb;
begin
  foreach t in array public.synced_tables() loop
    -- created: registros novos desde o cursor
    execute format($f$
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'last_modified_at' - 'deleted_at')
        || jsonb_build_object(
             'created_at', (extract(epoch from r.created_at) * 1000)::bigint,
             'updated_at', (extract(epoch from r.updated_at) * 1000)::bigint)
      ), '[]'::jsonb)
      from (select * from public.%I
            where deleted_at is null and created_at > $1) r
    $f$, t) into created using lpa;

    -- updated: criados antes do cursor, modificados depois
    execute format($f$
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'last_modified_at' - 'deleted_at')
        || jsonb_build_object(
             'created_at', (extract(epoch from r.created_at) * 1000)::bigint,
             'updated_at', (extract(epoch from r.updated_at) * 1000)::bigint)
      ), '[]'::jsonb)
      from (select * from public.%I
            where deleted_at is null
              and created_at <= $1 and last_modified_at > $1) r
    $f$, t) into updated using lpa;

    -- deleted: ids removidos desde o cursor (vazio no primeiro sync)
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
      t, jsonb_build_object('created', created, 'updated', updated, 'deleted', deleted));
  end loop;

  return jsonb_build_object('changes', changes, 'timestamp', server_ts);
end;
$$;

-- -----------------------------------------------------------------------------
-- PUSH
-- -----------------------------------------------------------------------------
create or replace function public.sync_push(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t       text;
  payload jsonb;
  upd_set text;
begin
  foreach t in array public.synced_tables() loop
    -- created + updated -> upsert
    payload := coalesce(changes->t->'created', '[]'::jsonb)
            || coalesce(changes->t->'updated', '[]'::jsonb);

    if jsonb_array_length(payload) > 0 then
      -- SET dinâmico: todas as colunas de domínio (exceto id e timestamps de sync)
      select string_agg(format('%I = excluded.%I', column_name, column_name), ', ')
        into upd_set
      from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name not in ('id','created_at','updated_at','last_modified_at','deleted_at');

      execute format($f$
        insert into public.%1$I
        select r.* from jsonb_populate_recordset(null::public.%1$I, (
          select jsonb_agg(e - 'created_at' - 'updated_at' - 'last_modified_at' - 'deleted_at')
          from jsonb_array_elements($1) e
        )) r
        on conflict (id) do update set %2$s
      $f$, t, upd_set) using payload;
    end if;

    -- deleted -> soft delete
    if jsonb_array_length(coalesce(changes->t->'deleted', '[]'::jsonb)) > 0 then
      execute format($f$
        update public.%1$I set deleted_at = now()
        where id in (select (jsonb_array_elements_text($1))::uuid)
      $f$, t) using (changes->t->'deleted');
    end if;
  end loop;
end;
$$;

-- Exposição via PostgREST (supabase.rpc)
grant execute on function public.sync_pull(bigint) to authenticated;
grant execute on function public.sync_push(jsonb)  to authenticated;
grant execute on function public.synced_tables()    to authenticated;
