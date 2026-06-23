import type { Model } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/react';
import { useEffect, useState } from 'react';

/**
 * Hook reativo: observa uma coleção do WatermelonDB e re-renderiza
 * automaticamente quando os dados mudam (inclusive após um sync).
 * Registros marcados como deletados são excluídos automaticamente.
 */
export function useCollection<T extends Model>(table: string): T[] {
  const database = useDatabase();
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    const subscription = database
      .get<T>(table)
      .query()
      .observe()
      .subscribe(setRows);
    return () => subscription.unsubscribe();
  }, [database, table]);

  return rows;
}
