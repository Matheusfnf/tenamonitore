import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { FeatureCollection } from 'geojson';

/**
 * Renderiza os polígonos dos talhões sobre o mapa (fill translúcido + traço).
 * `id` precisa ser único por mapa quando houver mais de uma instância.
 */
export function FieldPolygons({
  features,
  id = 'fields',
  color = '#7CE08A',
}: {
  features: FeatureCollection;
  id?: string;
  color?: string;
}) {
  if (features.features.length === 0) return null;
  return (
    <GeoJSONSource id={id} data={features}>
      <Layer
        id={`${id}-fill`}
        type="fill"
        paint={{ 'fill-color': color, 'fill-opacity': 0.15 }}
      />
      <Layer
        id={`${id}-line`}
        type="line"
        paint={{ 'line-color': color, 'line-width': 2 }}
      />
    </GeoJSONSource>
  );
}
