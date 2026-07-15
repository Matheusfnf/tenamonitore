import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * Estilo satélite do app.
 *
 * Produção/beta: defina EXPO_PUBLIC_MAPTILER_KEY no .env (plano grátis do
 * MapTiler — https://cloud.maptiler.com — cobre o beta com folga) e o app usa
 * o satélite do MapTiler, licenciado para uso em produto.
 *
 * Sem chave, cai para o raster do Esri World Imagery (ok para desenvolvimento
 * e testes; para produção prefira a chave).
 */
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

function buildSatelliteStyle(): StyleSpecification {
  if (MAPTILER_KEY) {
    return {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`,
          ],
          tileSize: 512,
          maxzoom: 20,
          attribution: '© MapTiler © Maxar',
        },
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
    };
  }
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  };
}

export const satelliteStyle: StyleSpecification = buildSatelliteStyle();

/** Centro aproximado do Brasil — fallback quando não há GPS nem fazenda. */
export const BRAZIL_CENTER: [number, number] = [-49.0, -15.5];
