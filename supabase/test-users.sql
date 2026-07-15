-- =============================================================================
-- Contas de teste do beta (revisor do Google + testadores)
-- =============================================================================
-- COMO USAR:
-- 1) No Supabase Dashboard → Authentication → Users → "Add user":
--    crie cada e-mail abaixo com uma senha forte e marque "Auto Confirm User".
-- 2) Ajuste os e-mails/nomes nos arrays abaixo se quiser.
-- 3) Rode este script no SQL Editor. Ele:
--    - grava role/organization_id/full_name no user_metadata (o app lê do JWT)
--    - corrige a linha em profiles (o trigger criou sem org)
--    - atribui TODAS as fazendas da org a cada consultor (assignments)
-- Pode rodar de novo sem medo (idempotente).
-- =============================================================================

do $$
declare
  org constant uuid := '00000000-0000-0000-0000-000000000001';
  emails constant text[] := array[
    'revisor.google@teste.tenamonitore.app',
    'testador1@teste.tenamonitore.app',
    'testador2@teste.tenamonitore.app'
  ];
  names constant text[] := array[
    'Revisor Google',
    'Testador Um',
    'Testador Dois'
  ];
  i   int;
  uid uuid;
begin
  for i in 1..array_length(emails, 1) loop
    select id into uid from auth.users where email = emails[i];
    if uid is null then
      raise exception 'Usuário % não existe — crie antes no Dashboard (Authentication → Users → Add user)', emails[i];
    end if;

    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object(
                'full_name', names[i],
                'role', 'consultant',
                'organization_id', org::text)
     where id = uid;

    update public.profiles
       set full_name = names[i],
           role = 'consultant',
           organization_id = org
     where id = uid;

    insert into public.assignments (farm_id, consultant_id)
    select f.id, uid
      from public.farms f
     where f.organization_id = org
       and f.deleted_at is null
       and not exists (
         select 1 from public.assignments a
          where a.farm_id = f.id
            and a.consultant_id = uid
            and a.deleted_at is null);

    raise notice 'OK: % (%) configurado como consultor da org', emails[i], uid;
  end loop;
end $$;
