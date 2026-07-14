import {
  OfflineManager,
  type OfflinePack,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';

import { satelliteStyle } from '@/lib/mapStyle';
import { supabase } from '@/supabase/client';

/**
 * Download offline da região da fazenda (tiles de satélite).
 *
 * O módulo nativo de offline do MapLibre exige o estilo numa URL (diferente do
 * componente de mapa, que aceita JSON inline). Solução: o próprio app publica
 * o JSON do estilo num bucket PÚBLICO do Supabase (migração 0005) e usa a URL
 * pública no createPack. Upload é idempotente (~1 KB, upsert).
 */
const STYLE_BUCKET = 'map-assets';
const STYLE_PATH = 'satellite-style.json';

async function ensureHostedStyleUrl(): Promise<string> {
  const publicUrl = supabase.storage
    .from(STYLE_BUCKET)
    .getPublicUrl(STYLE_PATH).data.publicUrl;

  const { error } = await supabase.storage
    .from(STYLE_BUCKET)
    .upload(STYLE_PATH, JSON.stringify(satelliteStyle), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) {
    // Upload falhou (ex.: permissão) — se o objeto já existe publicado, segue.
    const head = await fetch(publicUrl, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) {
      throw new Error(
        `Não foi possível publicar o estilo do mapa (aplique a migração 0005): ${error.message}`,
      );
    }
  }
  return publicUrl;
}

/** Pack offline da fazenda, se existir (procura pelo metadata.farmId). */
export async function getFarmPack(farmId: string): Promise<OfflinePack | null> {
  const packs = await OfflineManager.getPacks();
  return (
    packs.find((p) => (p.metadata as { farmId?: string })?.farmId === farmId) ??
    null
  );
}

/**
 * Baixa (ou re-baixa) a região da fazenda p/ uso offline.
 * Zooms 11–17 ≈ visão municipal até nível de talhão; algumas centenas de tiles.
 */
export async function downloadFarmPack(
  farmId: string,
  farmName: string,
  bounds: [number, number, number, number],
  onProgress: (status: OfflinePackStatus) => void,
  onError: (message: string) => void,
): Promise<OfflinePack> {
  const mapStyle = await ensureHostedStyleUrl();
  const existing = await getFarmPack(farmId);
  if (existing) {
    OfflineManager.removeListener(existing.id);
    await OfflineManager.deletePack(existing.id);
  }
  return OfflineManager.createPack(
    {
      mapStyle,
      bounds,
      minZoom: 11,
      maxZoom: 17,
      metadata: { farmId, name: farmName },
    },
    (_pack, status) => onProgress(status),
    (_pack, error) => onError(error.message),
  );
}

export async function deleteFarmPack(farmId: string): Promise<void> {
  const pack = await getFarmPack(farmId);
  if (pack) {
    OfflineManager.removeListener(pack.id);
    await OfflineManager.deletePack(pack.id);
  }
}

export function stopWatchingPack(packId: string): void {
  OfflineManager.removeListener(packId);
}
