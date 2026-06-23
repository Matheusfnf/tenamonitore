# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# TenaMonitore — contexto do projeto

App offline-first de monitoramento de talhões. Stack: Expo SDK 56 (RN 0.85, New Arch) +
WatermelonDB (SQLite/JSI) + Supabase (Postgres/Auth/Storage/RLS) + MapLibre RN.

## Como funciona o sync
- App lê/escreve no SQLite local (WatermelonDB). `src/sync/sync.ts` chama `synchronize()`,
  que usa as RPC `sync_pull(last_pulled_at)` e `sync_push(changes)` (Postgres, SECURITY
  INVOKER → RLS faz o escopo: admin=org, consultor=fazendas atribuídas).
- Tabelas têm `created_at/updated_at/deleted_at/last_modified_at`; o cursor é server-side.
  WatermelonDB NÃO tem `deleted_at`/`last_modified_at` (deletes via markAsDeleted).
- IDs são UUID: o gerador do WatermelonDB é sobrescrito com `expo-crypto` (`src/db/index.ts`).
- Geometria de talhão = GeoJSON **serializado em string** (coluna `boundary` text) para o
  sync ser type-clean (não usar jsonb aqui).

## Gotchas importantes
- **Dev client obrigatório** (não roda no Expo Go): WatermelonDB + MapLibre são nativos.
- **Babel:** models WatermelonDB NÃO podem usar `!` (definite assignment) nos fields — o
  `@babel/plugin-transform-typescript` quebra com decorators. Usar fields sem `!` +
  `strictPropertyInitialization: false` (tsconfig) + `assumptions.setPublicClassFields`
  (babel.config.js). Ver histórico se reaparecer "Definitely assigned fields...".
- **Validação local:** `npx tsc --noEmit` e `npx expo export --platform android` (bundle
  Metro) pegam erros de import/babel sem precisar de device.
- **Usuários:** papel/org vêm do `user_metadata` do Supabase Auth (trigger handle_new_user
  popula profiles). Org padrão no seed: `00000000-0000-0000-0000-000000000001`.
