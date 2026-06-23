import { Q, type Model } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/react';
import { useEffect, useState } from 'react';

/**
 * Observa uma coleção inteira do WatermelonDB (reativo: re-renderiza quando os
 * dados mudam, inclusive após um sync). Registros deletados são excluídos.
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

/**
 * Observa os registros de uma tabela filtrando por uma coluna = valor.
 * Ex.: useChildren<Field>('fields', 'farm_id', farmId).
 */
export function useChildren<T extends Model>(
  table: string,
  column: string,
  value: string,
): T[] {
  const database = useDatabase();
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    const subscription = database
      .get<T>(table)
      .query(Q.where(column, value))
      .observe()
      .subscribe(setRows);
    return () => subscription.unsubscribe();
  }, [database, table, column, value]);

  return rows;
}
