import { Q, type Model } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/react';
import { useEffect, useState } from 'react';

/**
 * Observa uma coleção inteira do WatermelonDB (reativo: re-renderiza quando os
 * dados mudam, inclusive após um sync). Registros deletados são excluídos.
 *
 * IMPORTANTE: usa observeWithColumns(['updated_at']) — o observe() simples só
 * re-emite quando registros ENTRAM/SAEM do resultado, não quando um campo
 * muda. Como o WatermelonDB gerencia updated_at em todo update, observar essa
 * coluna torna a UI reativa a edições também.
 */
export function useCollection<T extends Model>(table: string): T[] {
  const database = useDatabase();
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    const subscription = database
      .get<T>(table)
      .query()
      .observeWithColumns(['updated_at'])
      .subscribe(setRows);
    return () => subscription.unsubscribe();
  }, [database, table]);

  return rows;
}

/**
 * Observa os registros de uma tabela filtrando por uma coluna = valor.
 * Ex.: useChildren<Field>('fields', 'farm_id', farmId).
 * Reativo a edições de campos (ver nota em useCollection).
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
      .observeWithColumns(['updated_at'])
      .subscribe(setRows);
    return () => subscription.unsubscribe();
  }, [database, table, column, value]);

  return rows;
}
