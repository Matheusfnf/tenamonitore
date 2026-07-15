import {
  addColumns,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';

/**
 * Migrações do schema local (espelham as migrações SQL do Supabase).
 * Ao evoluir o schema: incremente `version` em schema.ts e adicione aqui
 * um bloco { toVersion, steps: [...] } correspondente.
 */
export const migrations = schemaMigrations({
  migrations: [
    {
      // nome da visita (migração 0006 no Postgres)
      toVersion: 2,
      steps: [
        addColumns({
          table: 'visits',
          columns: [{ name: 'name', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
