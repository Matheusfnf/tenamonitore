import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * Migrações do schema local. Vazio na v1.
 * Ao evoluir o schema: incremente `version` em schema.ts e adicione aqui
 * um bloco { toVersion, steps: [...] } correspondente.
 */
export const migrations = schemaMigrations({
  migrations: [],
});
