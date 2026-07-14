import { area as turfArea, bbox as turfBbox, centroid as turfCentroid } from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';

import type { Field } from '@/db/models';

/**
 * O boundary do talhão trafega como GeoJSON serializado em string (coluna
 * text — ver AGENTS.md). Aqui ficam parse/serialize e as contas de geometria.
 */
export type BoundaryFeature = Feature<Polygon>;

export function parseBoundary(boundary: string | null): BoundaryFeature | null {
  if (!boundary) return null;
  try {
    const parsed = JSON.parse(boundary);
    if (parsed?.type === 'Feature' && parsed.geometry?.type === 'Polygon') {
      return parsed as BoundaryFeature;
    }
    if (parsed?.type === 'Polygon') {
      return { type: 'Feature', properties: {}, geometry: parsed };
    }
    return null;
  } catch {
    return null;
  }
}

/** Monta um Feature<Polygon> a partir dos vértices (fecha o anel). */
export function polygonFromVertices(vertices: Position[]): BoundaryFeature {
  const ring = [...vertices, vertices[0]];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

/** Área em hectares (2 casas). */
export function areaHaOf(feature: BoundaryFeature): number {
  return Math.round((turfArea(feature) / 10_000) * 100) / 100;
}

/** Centro (centroide) como [lng, lat]. */
export function centerOf(feature: BoundaryFeature): [number, number] {
  const c = turfCentroid(feature);
  return [c.geometry.coordinates[0], c.geometry.coordinates[1]];
}

/** FeatureCollection dos talhões que têm polígono (properties: fieldId/name). */
export function fieldsToFeatureCollection(fields: Field[]): FeatureCollection {
  const features: Feature[] = [];
  for (const f of fields) {
    const boundary = parseBoundary(f.boundary);
    if (boundary) {
      features.push({
        ...boundary,
        properties: { ...boundary.properties, fieldId: f.id, name: f.name },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Bounds [w, s, e, n] da coleção com margem em km (aprox. 1° ≈ 111 km).
 * Retorna null se a coleção estiver vazia.
 */
export function boundsWithMargin(
  collection: FeatureCollection,
  marginKm: number,
): [number, number, number, number] | null {
  if (collection.features.length === 0) return null;
  const [w, s, e, n] = turfBbox(collection);
  const margin = marginKm / 111;
  return [w - margin, s - margin, e + margin, n + margin];
}

/** Bounds quadrado em volta de um ponto (fallback quando não há polígonos). */
export function boundsAroundPoint(
  lng: number,
  lat: number,
  radiusKm: number,
): [number, number, number, number] {
  const r = radiusKm / 111;
  return [lng - r, lat - r, lng + r, lat + r];
}
