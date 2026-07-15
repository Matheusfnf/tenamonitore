-- Nome opcional da visita (dado pelo consultor ao iniciar a visita no mapa).
-- O sync_pull/sync_push são genéricos (information_schema), então a coluna
-- nova passa a sincronizar automaticamente. Espelha a v2 do schema local.

alter table public.visits add column if not exists name text;
