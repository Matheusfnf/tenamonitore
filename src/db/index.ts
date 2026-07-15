import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import * as Crypto from 'expo-crypto';

import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

// Os IDs gerados pelo WatermelonDB precisam ser UUIDs válidos para casar
// com as colunas `uuid` do Postgres (Supabase). Sobrescrevemos o gerador.
setGenerator(() => Crypto.randomUUID());

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true, // síncrono e rápido; habilitado nativamente pelo watermelondb-expo-plugin
  dbName: 'tenamonitore',
  onSetUpError: (error) => {
    console.error('[WatermelonDB] falha ao inicializar o banco local', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});
