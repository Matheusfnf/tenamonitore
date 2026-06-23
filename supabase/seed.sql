-- =============================================================================
-- TenaMonitore — Seed: organização padrão + catálogos iniciais
-- Rode após 0001_init.sql e 0002_sync_functions.sql.
-- Idempotente: pode rodar mais de uma vez sem duplicar.
-- =============================================================================

-- Organização padrão (use este id no user_metadata.organization_id dos usuários).
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Organização Padrão')
on conflict (id) do nothing;

-- Culturas
insert into public.crops (organization_id, name)
select '00000000-0000-0000-0000-000000000001', c.name
from (values
  ('Soja'), ('Milho'), ('Algodão'), ('Café'),
  ('Cana-de-açúcar'), ('Trigo'), ('Feijão'), ('Arroz')
) as c(name)
where not exists (
  select 1 from public.crops x
  where x.organization_id = '00000000-0000-0000-0000-000000000001'
    and x.name = c.name
);

-- Pragas e doenças comuns no Brasil
insert into public.threats (organization_id, name, type, scientific_name)
select '00000000-0000-0000-0000-000000000001', t.name, t.type, t.sci
from (values
  ('Lagarta-do-cartucho',     'pest',    'Spodoptera frugiperda'),
  ('Percevejo-marrom',        'pest',    'Euschistus heros'),
  ('Mosca-branca',            'pest',    'Bemisia tabaci'),
  ('Bicudo-do-algodoeiro',    'pest',    'Anthonomus grandis'),
  ('Lagarta-da-soja',         'pest',    'Anticarsia gemmatalis'),
  ('Ácaro-rajado',            'pest',    'Tetranychus urticae'),
  ('Ferrugem-asiática',       'disease', 'Phakopsora pachyrhizi'),
  ('Mancha-alvo',             'disease', 'Corynespora cassiicola'),
  ('Mofo-branco',             'disease', 'Sclerotinia sclerotiorum'),
  ('Antracnose',              'disease', 'Colletotrichum spp.'),
  ('Mancha-de-cercospora',    'disease', 'Cercospora kikuchii'),
  ('Oídio',                   'disease', 'Erysiphe diffusa')
) as t(name, type, sci)
where not exists (
  select 1 from public.threats x
  where x.organization_id = '00000000-0000-0000-0000-000000000001'
    and x.name = t.name
);
