-- =============================================================================
-- TenaMonitore — Migração inicial: schema, triggers de sync e RLS
-- =============================================================================
-- Modelo offline-first. TODA tabela sincronizável tem 4 colunas de sync:
--   created_at, updated_at, deleted_at (soft delete) e last_modified_at (cursor).
-- O WatermelonDB lê/escreve no SQLite local e sincroniza via as funções
-- sync_pull/sync_push (ver 0002_sync_functions.sql).
-- A geometria dos talhões trafega como GeoJSON (jsonb) para simplificar o sync.
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Trigger genérico de timestamps de sync (server-authoritative)
-- -----------------------------------------------------------------------------
create or replace function public.set_sync_timestamps()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();
  new.last_modified_at := now();
  return new;
end;
$$;

-- =============================================================================
-- TABELAS
-- =============================================================================

create table if not exists public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid references public.organizations(id),
  full_name        text,
  role             text not null default 'consultant' check (role in ('admin','consultant')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.crops (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  name             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.threats (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  name             text not null,
  type             text not null check (type in ('pest','disease')),
  scientific_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.farms (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  name             text not null,
  owner_name       text,
  municipality     text,
  state            text,
  center_lat       double precision,
  center_lng       double precision,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.fields (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms(id),
  crop_id          uuid references public.crops(id),
  name             text not null,
  area_ha          numeric,
  boundary         text,             -- GeoJSON Polygon serializado (string) p/ sync limpo
  season           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms(id),
  consultant_id    uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);
-- impede duplicar atribuição ativa do mesmo consultor à mesma fazenda
create unique index if not exists assignments_unique_active
  on public.assignments (farm_id, consultant_id) where deleted_at is null;

create table if not exists public.visits (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms(id),
  consultant_id    uuid not null references public.profiles(id),
  visit_date       date not null default current_date,
  status           text not null default 'open' check (status in ('open','closed')),
  weather          text,
  notes            text,
  lat              double precision,
  lng              double precision,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.observations (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null references public.visits(id),
  field_id         uuid references public.fields(id),
  threat_id        uuid references public.threats(id),
  severity         numeric,          -- 0..5 (escala do consultor)
  incidence        numeric,          -- % de incidência
  notes            text,
  lat              double precision,
  lng              double precision,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.observation_photos (
  id               uuid primary key default gen_random_uuid(),
  observation_id   uuid not null references public.observations(id),
  storage_path     text,             -- caminho no Supabase Storage (após upload)
  local_uri        text,             -- uri local no device (antes do upload)
  uploaded         boolean not null default false,
  lat              double precision,
  lng              double precision,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null references public.visits(id),
  observation_id   uuid references public.observations(id),
  text             text not null,
  product          text,
  dose             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null references public.visits(id),
  summary          text,
  pdf_path         text,
  generated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_modified_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Triggers de sync + índices do cursor e de foreign keys (loop sobre as tabelas)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array[
    'organizations','profiles','crops','threats','farms','fields',
    'assignments','visits','observations','observation_photos',
    'recommendations','reports'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_sync_ts on public.%I', t);
    execute format(
      'create trigger trg_sync_ts before insert or update on public.%I
         for each row execute function public.set_sync_timestamps()', t);
    execute format(
      'create index if not exists %I on public.%I (last_modified_at)',
      t || '_lmod_idx', t);
  end loop;
end $$;

create index if not exists fields_farm_idx        on public.fields (farm_id);
create index if not exists assignments_farm_idx   on public.assignments (farm_id);
create index if not exists assignments_cons_idx   on public.assignments (consultant_id);
create index if not exists visits_farm_idx        on public.visits (farm_id);
create index if not exists visits_cons_idx        on public.visits (consultant_id);
create index if not exists obs_visit_idx          on public.observations (visit_id);
create index if not exists photos_obs_idx         on public.observation_photos (observation_id);
create index if not exists recs_visit_idx         on public.recommendations (visit_id);
create index if not exists reports_visit_idx      on public.reports (visit_id);

-- =============================================================================
-- HELPERS DE AUTORIZAÇÃO (security definer p/ evitar recursão de RLS)
-- =============================================================================
create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_assigned_farm(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments a
                 where a.consultant_id = auth.uid()
                   and a.farm_id = f and a.deleted_at is null);
$$;

create or replace function public.can_access_farm(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.farms fa
                 where fa.id = f
                   and fa.organization_id = public.current_org()
                   and (public.is_admin() or public.is_assigned_farm(f)));
$$;

create or replace function public.can_access_visit(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.visits vi
      join public.farms fa on fa.id = vi.farm_id
    where vi.id = v
      and fa.organization_id = public.current_org()
      and (vi.consultant_id = auth.uid() or public.is_admin()));
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.organizations      enable row level security;
alter table public.profiles            enable row level security;
alter table public.crops               enable row level security;
alter table public.threats             enable row level security;
alter table public.farms               enable row level security;
alter table public.fields              enable row level security;
alter table public.assignments         enable row level security;
alter table public.visits              enable row level security;
alter table public.observations        enable row level security;
alter table public.observation_photos  enable row level security;
alter table public.recommendations     enable row level security;
alter table public.reports             enable row level security;

-- organizations: a própria org é legível por seus membros
create policy org_select on public.organizations for select to authenticated
  using (id = public.current_org());

-- profiles: membros da org se enxergam; cada um edita o próprio
create policy profiles_select on public.profiles for select to authenticated
  using (organization_id = public.current_org());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- catálogos: leitura por toda a org, escrita só admin
create policy crops_select on public.crops for select to authenticated
  using (organization_id = public.current_org());
create policy crops_write on public.crops for all to authenticated
  using (public.is_admin() and organization_id = public.current_org())
  with check (public.is_admin() and organization_id = public.current_org());

create policy threats_select on public.threats for select to authenticated
  using (organization_id = public.current_org());
create policy threats_write on public.threats for all to authenticated
  using (public.is_admin() and organization_id = public.current_org())
  with check (public.is_admin() and organization_id = public.current_org());

-- farms: admin vê todas da org; consultor vê as atribuídas; escrita só admin
create policy farms_select on public.farms for select to authenticated
  using (organization_id = public.current_org()
         and (public.is_admin() or public.is_assigned_farm(id)));
create policy farms_write on public.farms for all to authenticated
  using (public.is_admin() and organization_id = public.current_org())
  with check (public.is_admin() and organization_id = public.current_org());

-- fields (talhões): acesso herdado da fazenda; escrita só admin
create policy fields_select on public.fields for select to authenticated
  using (public.can_access_farm(farm_id));
create policy fields_write on public.fields for all to authenticated
  using (public.is_admin() and public.can_access_farm(farm_id))
  with check (public.is_admin() and public.can_access_farm(farm_id));

-- assignments: admin gerencia; consultor lê as próprias
create policy assignments_select on public.assignments for select to authenticated
  using (public.is_admin() or consultant_id = auth.uid());
create policy assignments_write on public.assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- visits: consultor CRUD das próprias (em fazenda atribuída); admin vê/edita as da org
create policy visits_select on public.visits for select to authenticated
  using (consultant_id = auth.uid() or public.can_access_farm(farm_id) and public.is_admin());
create policy visits_insert on public.visits for insert to authenticated
  with check ((consultant_id = auth.uid() and public.is_assigned_farm(farm_id))
              or (public.is_admin() and public.can_access_farm(farm_id)));
create policy visits_update on public.visits for update to authenticated
  using (consultant_id = auth.uid() or public.is_admin())
  with check (consultant_id = auth.uid() or public.is_admin());
create policy visits_delete on public.visits for delete to authenticated
  using (consultant_id = auth.uid() or public.is_admin());

-- observations / photos / recommendations / reports: acesso pela visita
create policy obs_all on public.observations for all to authenticated
  using (public.can_access_visit(visit_id))
  with check (public.can_access_visit(visit_id));

create policy photos_all on public.observation_photos for all to authenticated
  using (exists (select 1 from public.observations o
                 where o.id = observation_id and public.can_access_visit(o.visit_id)))
  with check (exists (select 1 from public.observations o
                 where o.id = observation_id and public.can_access_visit(o.visit_id)));

create policy recs_all on public.recommendations for all to authenticated
  using (public.can_access_visit(visit_id))
  with check (public.can_access_visit(visit_id));

create policy reports_all on public.reports for all to authenticated
  using (public.can_access_visit(visit_id))
  with check (public.can_access_visit(visit_id));

-- =============================================================================
-- CRIAÇÃO AUTOMÁTICA DE PROFILE ao cadastrar usuário no Supabase Auth
-- O papel e a org vêm do user_metadata (definidos pelo admin no convite).
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, organization_id)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'consultant'),
    nullif(new.raw_user_meta_data->>'organization_id','')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
