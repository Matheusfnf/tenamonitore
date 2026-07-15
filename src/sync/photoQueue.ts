import { Q } from '@nozbe/watermelondb';
import { File } from 'expo-file-system';

import { database } from '@/db';
import type { ObservationPhoto } from '@/db/models';
import { supabase } from '@/supabase/client';

const BUCKET = 'observation-photos';

/**
 * Sobe as fotos pendentes pro Supabase Storage. Roda após cada sync bem
 * sucedido (ou seja, com rede). Cada foto é independente: falha em uma não
 * bloqueia as demais — a pendente tenta de novo no próximo ciclo.
 *
 * Caminho no bucket: <organization_id>/<observation_id>/<photo_id>.jpg
 * (o 1º segmento é usado pelas policies de RLS do Storage — migração 0003).
 *
 * @returns quantas fotos subiram (o chamador decide se re-sincroniza p/
 * empurrar storage_path/uploaded pro Postgres).
 */
export async function uploadPendingPhotos(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  const orgId = (data.session?.user.user_metadata as Record<string, unknown>)
    ?.organization_id as string | undefined;
  if (!orgId) return 0;

  const pending = await database
    .get<ObservationPhoto>('observation_photos')
    .query(Q.where('uploaded', false))
    .fetch();

  let uploadedCount = 0;
  for (const photo of pending) {
    if (!photo.localUri) continue;
    try {
      const file = new File(photo.localUri);
      if (!file.exists) continue; // SO limpou o arquivo: nada a subir
      const bytes = await file.bytes();
      const path = `${orgId}/${photo.observationId}/${photo.id}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);

      await database.write(async () => {
        await photo.update((p) => {
          p.storagePath = path;
          p.uploaded = true;
        });
      });
      uploadedCount += 1;
    } catch (e) {
      console.warn('[photos] upload falhou, tentará no próximo sync', photo.id, e);
    }
  }
  return uploadedCount;
}
