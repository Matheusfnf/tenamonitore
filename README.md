# TenaMonitore 🌱

App **mobile offline-first** para monitoramento e análise de talhões e campos de fazendas.
O **administrador** cadastra fazendas, talhões (limites geográficos) e atribui consultores.
Os **consultores** fazem visitas técnicas, registram observações de pragas/doenças por talhão
(com severidade, fotos georreferenciadas e notas) e geram **relatórios diários** — tudo
funcionando **sem internet** e sincronizando quando há conexão.

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | React Native + **Expo SDK 56** (TypeScript, Expo Router) |
| UI | React Native Paper (Material 3) |
| Banco local / offline | **WatermelonDB** (SQLite, JSI) |
| Backend | **Supabase** (Postgres + Auth + Storage + RLS) |
| Sincronização | WatermelonDB sync ↔ funções RPC `sync_pull` / `sync_push` |
| Mapas | **MapLibre React Native** (polígonos GeoJSON + tiles offline) |

> ⚠️ **Não funciona no Expo Go.** WatermelonDB e MapLibre usam código nativo, então é
> obrigatório um **development build (dev client)** via EAS. Ver passo 4.

## Pré-requisitos

- Node 20.19+/22.13+ (recomendado), npm
- Conta no [Expo/EAS](https://expo.dev) e `npm i -g eas-cli` (para builds)
- Projeto no [Supabase](https://supabase.com)
- Android Studio (emulador) ou device físico com o app de dev client instalado

## Setup

### 1. Dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os dados do seu projeto Supabase
(Dashboard → Project Settings → API):

```
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

### 3. Banco de dados (Supabase)

Aplique as migrações em ordem. Opção simples: copie o conteúdo no **SQL Editor** do
Dashboard, na ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, colunas de sync, triggers e RLS
2. `supabase/migrations/0002_sync_functions.sql` — funções `sync_pull` / `sync_push`
3. `supabase/seed.sql` — organização padrão + catálogos (culturas e pragas/doenças)

Ou via Supabase CLI (recomendado para versionar):

```bash
supabase link --project-ref SEU_REF
supabase db push          # aplica as migrações
# rode o seed.sql manualmente no SQL Editor, se desejar
```

**Crie o usuário administrador** (Dashboard → Authentication → Add user) com
*user metadata* (a trigger `handle_new_user` usa esses campos):

```json
{ "role": "admin", "full_name": "Seu Nome", "organization_id": "00000000-0000-0000-0000-000000000001" }
```

Consultores são criados do mesmo modo com `"role": "consultant"`.

### 4. Development build (dev client)

```bash
eas login
eas build:configure
eas build --profile development --platform android   # gera um APK de dev client
```

Instale o APK no device/emulador. Para iOS use `--platform ios` (requer macOS/conta Apple).

### 5. Rodar o bundler

```bash
npx expo start --dev-client
```

Abra o app de dev client instalado e conecte ao bundler.

## Estrutura

```
src/
  app/                  # rotas (Expo Router)
    _layout.tsx         # providers (Paper, WatermelonDB, Auth, Sync) + auth gate
    index.tsx           # home por papel (admin/consultor) + status de sync
    (auth)/login.tsx
  auth/AuthProvider.tsx # sessão Supabase; papel derivado do JWT (offline)
  supabase/client.ts    # cliente Supabase (AsyncStorage, auto-refresh)
  sync/                 # runSync() + SyncProvider (gatilhos de conectividade)
  db/                   # WatermelonDB: schema, models, database (UUID via expo-crypto)
  lib/env.ts
supabase/migrations/    # SQL: schema/RLS + funções de sync
supabase/seed.sql
```

## Testando o offline (cenário-chave)

1. Logue (online) e aguarde a primeira sincronização.
2. Ative o **modo avião**; crie/edite dados — tudo continua funcionando (SQLite local).
3. Volte a rede: os dados aparecem no Postgres (Supabase) automaticamente.

## Roadmap

- **Fase 1 (MVP):** CRUD de fazendas/talhões com mapa, mapas offline, fluxo de visita +
  observações + fotos + GPS, relatório diário em PDF.
- **Fase 2:** IA de reconhecimento de praga/doença por imagem, dashboards, push, multi-tenant.
