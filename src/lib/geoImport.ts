import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import { strFromU8, unzipSync } from 'fflate';
import type { File } from 'expo-file-system';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';

import { areaHaOf, type BoundaryFeature } from '@/lib/boundaries';

/** Talhão extraído de um arquivo KML/KMZ/GeoJSON. */
export interface ImportedField {
  name: string;
  feature: BoundaryFeature;
  areaHa: number;
}

function polygonsFromGeometry(geometry: Geometry): Polygon[] {
  if (geometry.type === 'Polygon') return [geometry];
  if (geometry.type === 'MultiPolygon') {
    return (geometry as MultiPolygon).coordinates.map((coords) => ({
      type: 'Polygon',
      coordinates: coords,
    }));
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(polygonsFromGeometry);
  }
  return [];
}

function extractFields(collection: FeatureCollection): ImportedField[] {
  const result: ImportedField[] = [];
  for (const feature of collection.features) {
    if (!feature.geometry) continue;
    const polygons = polygonsFromGeometry(feature.geometry);
    const baseName =
      (feature.properties?.name as string | undefined)?.trim() || null;
    polygons.forEach((polygon, i) => {
      // KML costuma trazer altitude como 3ª coordenada — normaliza p/ [lng,lat]
      const cleaned: Polygon = {
        type: 'Polygon',
        coordinates: polygon.coordinates.map((ring) =>
          ring.map(([lng, lat]) => [lng, lat]),
        ),
      };
      const boundary: BoundaryFeature = {
        type: 'Feature',
        properties: {},
        geometry: cleaned,
      };
      const name = baseName
        ? polygons.length > 1
          ? `${baseName} ${i + 1}`
          : baseName
        : `Talhão ${result.length + 1}`;
      result.push({ name, feature: boundary, areaHa: areaHaOf(boundary) });
    });
  }
  return result;
}

function parseKmlText(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  // togeojson espera um Document do DOM do browser; o do xmldom é compatível
  return kmlToGeoJSON(doc as unknown as Document) as FeatureCollection;
}

/**
 * Lê um arquivo KML, KMZ ou GeoJSON e devolve os polígonos encontrados.
 * Lança Error com mensagem amigável p/ formatos não suportados/corrompidos.
 */
export async function parseGeoFile(file: File): Promise<ImportedField[]> {
  const name = file.name.toLowerCase();
  const bytes = await file.bytes();

  let collection: FeatureCollection;
  if (name.endsWith('.kml')) {
    collection = parseKmlText(strFromU8(bytes));
  } else if (name.endsWith('.kmz')) {
    const entries = unzipSync(bytes);
    const kmlEntry = Object.keys(entries).find((k) =>
      k.toLowerCase().endsWith('.kml'),
    );
    if (!kmlEntry) throw new Error('O KMZ não contém um arquivo KML.');
    collection = parseKmlText(strFromU8(entries[kmlEntry]));
  } else if (name.endsWith('.geojson') || name.endsWith('.json')) {
    const parsed = JSON.parse(strFromU8(bytes));
    collection =
      parsed?.type === 'FeatureCollection'
        ? parsed
        : parsed?.type === 'Feature'
          ? { type: 'FeatureCollection', features: [parsed as Feature] }
          : (() => {
              throw new Error('GeoJSON inválido (esperado FeatureCollection).');
            })();
  } else {
    throw new Error(
      'Formato não suportado. Use KML, KMZ ou GeoJSON (shapefile: converta antes, ex. no Google Earth).',
    );
  }

  const fields = extractFields(collection);
  if (fields.length === 0) {
    throw new Error('Nenhum polígono encontrado no arquivo.');
  }
  return fields;
}
