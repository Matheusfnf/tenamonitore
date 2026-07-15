-- Relatórios técnicos compostos: título, blocos de conteúdo (JSON em text,
-- padrão do projeto p/ sync type-clean) e 0..N visitas (visit_ids JSON array).
-- visit_id vira opcional (legado do relatório rápido de uma visita) e o RLS
-- passa a escopar por autor/org — relatório pode existir sem visita.

alter table public.reports
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists consultant_id   uuid references public.profiles(id),
  add column if not exists farm_id         uuid references public.farms(id),
  add column if not exists title           text,
  add column if not exists visit_ids       text,
  add column if not exists content         text;

alter table public.reports alter column visit_id drop not null;

drop policy if exists reports_all on public.reports;
create policy reports_all on public.reports for all to authenticated
  using (
    consultant_id = auth.uid()
    or (public.is_admin() and organization_id = public.current_org())
    or (visit_id is not null and public.can_access_visit(visit_id))
  )
  with check (
    consultant_id = auth.uid()
    or (public.is_admin() and organization_id = public.current_org())
    or (visit_id is not null and public.can_access_visit(visit_id))
  );
