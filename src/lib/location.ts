import * as Location from 'expo-location';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Captura a posição atual com precisão alta (10m). Se o fix demorar/falhar
 * (comum em campo com céu encoberto), cai para a última posição conhecida.
 * Retorna null se a permissão for negada ou não houver posição alguma —
 * o chamador decide se bloqueia ou segue sem GPS (offline-first: nunca trava).
 */
export async function getCurrentPosition(): Promise<GeoPoint | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last
      ? { lat: last.coords.latitude, lng: last.coords.longitude }
      : null;
  }
}

/** Formata um ponto p/ exibição curta (ex.: -19.91234, -43.93456). */
export function formatGeoPoint(point: GeoPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
