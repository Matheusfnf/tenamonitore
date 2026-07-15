import { synchronize } from '@nozbe/watermelondb/sync';

import { database } from '@/db';
import { supabase } from '@/supabase/client';

interface PullResult {
  changes: Record<string, { created: any[]; updated: any[]; deleted: string[] }>;
  timestamp: number;
}

/**
 * Executa um ciclo de sincronização WatermelonDB <-> Supabase.
 * Usa as funções RPC sync_pull / sync_push (ver supabase/migrations/0002).
 * Lança erro em falha — o chamador (SyncProvider) trata e exibe status.
 */
export async function runSync(): Promise<void> {
  await synchronize({
    database,
    // O sync_pull (migração 0004) entrega TUDO no bucket `updated` — este
    // flag diz ao WatermelonDB que isso é intencional: registros
    // desconhecidos são criados sem o diagnostic "doesn't exist locally".
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const { data, error } = await supabase.rpc('sync_pull', {
        last_pulled_at: lastPulledAt ?? 0,
      });
      if (error) throw new Error(`pull falhou: ${error.message}`);
      const result = data as PullResult;
      return { changes: result.changes, timestamp: result.timestamp };
    },
    pushChanges: async ({ changes }) => {
      const { error } = await supabase.rpc('sync_push', { changes });
      if (error) throw new Error(`push falhou: ${error.message}`);
    },
  });
}
