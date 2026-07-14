import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * Estilo satélite via raster tiles do Esri World Imagery — grátis com
 * atribuição, sem chave de API. É o mapa que faz sentido no campo: o
 * consultor enxerga os talhões de verdade, não um mapa de ruas vazio.
 */
export const satelliteStyle: StyleSpecification = {
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
  layers: [
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
    },
  ],
};

/** Centro aproximado do Brasil — fallback quando não há GPS nem fazenda. */
export const BRAZIL_CENTER: [number, number] = [-49.0, -15.5];
