import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { FeatureCollection, Position } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Chip, Text } from 'react-native-paper';

import { FieldPolygons } from '@/components/FieldPolygons';
import { database } from '@/db';
import type { Farm, Field } from '@/db/models';
import { useChildren } from '@/db/useCollection';
import {
  areaHaOf,
  centerOf,
  fieldsToFeatureCollection,
  parseBoundary,
  polygonFromVertices,
  type BoundaryFeature,
} from '@/lib/boundaries';
import { BRAZIL_CENTER, satelliteStyle } from '@/lib/mapStyle';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

export default function DrawFieldScreen() {
  const { id, fieldId } = useLocalSearchParams<{ id: string; fieldId: string }>();
  const router = useRouter();
  const { syncNow } = useSync();
  const farmId = id ?? '';

  const farm = useChildren<Farm>('farms', 'id', farmId)[0];
  const fields = useChildren<Field>('fields', 'farm_id', farmId);
  const field = fields.find((f) => f.id === fieldId);

  // Vértices do polígono em edição ([lng, lat]). O talhão carrega do banco de
  // forma assíncrona — inicializar via useState perderia o boundary existente
  // (no 1º render `field` ainda é undefined). Por isso o efeito abaixo roda
  // UMA vez assim que o registro chega.
  const [vertices, setVertices] = useState<Position[]>([]);
  const loadedExisting = useRef(false);
  useEffect(() => {
    if (loadedExisting.current || !field) return;
    loadedExisting.current = true;
    const existing = parseBoundary(field.boundary);
    if (existing) {
      const ring = existing.geometry.coordinates[0] ?? [];
      setVertices(ring.slice(0, Math.max(0, ring.length - 1))); // sem o fechamento
    }
  }, [field]);
  const [saving, setSaving] = useState(false);

  const polygon = vertices.length >= 3 ? polygonFromVertices(vertices) : null;
  const areaHa = polygon ? areaHaOf(polygon) : null;

  // Talhões vizinhos (contexto) — exclui o que está sendo editado.
  const otherFields = useMemo(
    () => fieldsToFeatureCollection(fields.filter((f) => f.id !== fieldId)),
    [fields, fieldId],
  );

  // Desenho em andamento: polígono (>=3 pontos) ou linha (2 pontos).
  const drawing = useMemo<FeatureCollection>(() => {
    const features: FeatureCollection['features'] = [];
    if (polygon) {
      features.push(polygon);
    } else if (vertices.length === 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: vertices },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [polygon, vertices]);

  const initialCenter = useMemo<[number, number]>(() => {
    const existing = parseBoundary(field?.boundary ?? null);
    if (existing) return centerOf(existing);
    if (otherFields.features.length > 0) {
      return centerOf(otherFields.features[0] as BoundaryFeature);
    }
    if (farm?.centerLat != null && farm?.centerLng != null) {
      return [farm.centerLng, farm.centerLat];
    }
    return BRAZIL_CENTER;
  }, [field, farm, otherFields]);

  const onSave = async () => {
    if (!field || !polygon || saving) return;
    setSaving(true);
    try {
      const [lng, lat] = centerOf(polygon);
      await database.write(async () => {
        await field.update((f) => {
          f.boundary = JSON.stringify(polygon);
          f.areaHa = areaHa;
        });
        // 1º polígono da fazenda também define o centro (usado nos mapas)
        if (farm && (farm.centerLat == null || farm.centerLng == null)) {
          await farm.update((fa) => {
            fa.centerLat = lat;
            fa.centerLng = lng;
          });
        }
      });
      void syncNow();
      router.back();
    } catch (e) {
      Alert.alert('Talhão', `Não foi possível salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={field?.name ?? 'Talhão'}
          subtitle="Desenhar limites"
        />
      </Appbar.Header>

      {!field ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
      <>
      <View style={styles.mapWrap}>
        <MapLibreMap
          style={styles.map}
          mapStyle={satelliteStyle}
          attributionPosition={{ bottom: 8, left: 8 }}
          onPress={(e) => {
            const [lng, lat] = e.nativeEvent.lngLat;
            setVertices((prev) => [...prev, [lng, lat]]);
          }}
        >
          <Camera
            initialViewState={{
              center: initialCenter,
              zoom: initialCenter === BRAZIL_CENTER ? 3.5 : 15,
            }}
          />
          <UserLocation />
          <FieldPolygons features={otherFields} id="other-fields" color="#B0BEC5" />
          {drawing.features.length > 0 ? (
            <GeoJSONSource id="drawing" data={drawing}>
              <Layer
                id="drawing-fill"
                type="fill"
                paint={{ 'fill-color': '#7CE08A', 'fill-opacity': 0.25 }}
              />
              <Layer
                id="drawing-line"
                type="line"
                paint={{ 'line-color': '#7CE08A', 'line-width': 2.5 }}
              />
            </GeoJSONSource>
          ) : null}
          {vertices.map((v, i) => (
            <Marker key={`${v[0]}-${v[1]}-${i}`} lngLat={[v[0], v[1]]}>
              <View style={styles.vertex} />
            </Marker>
          ))}
        </MapLibreMap>

        <View style={styles.hintOverlay}>
          <Text variant="labelMedium" style={styles.hintText}>
            {vertices.length < 3
              ? `Toque nos cantos do talhão (${vertices.length}/3 pontos mínimos)`
              : `${areaHa} ha · ${vertices.length} pontos`}
          </Text>
        </View>
      </View>

      <View style={[styles.toolbar, { paddingBottom: 12 }]}>
        <Chip
          icon="vector-polygon"
          compact
          style={styles.areaChip}
        >
          {areaHa != null ? `Área: ${areaHa} ha` : 'Sem polígono'}
        </Chip>
        <View style={styles.buttons}>
          <Button
            mode="outlined"
            icon="undo"
            disabled={vertices.length === 0}
            onPress={() => setVertices((prev) => prev.slice(0, -1))}
          >
            Desfazer
          </Button>
          <Button
            mode="outlined"
            icon="delete-outline"
            disabled={vertices.length === 0}
            onPress={() => setVertices([])}
          >
            Limpar
          </Button>
          <Button
            mode="contained"
            icon="check"
            loading={saving}
            disabled={!polygon || saving}
            onPress={onSave}
          >
            Salvar
          </Button>
        </View>
      </View>
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  vertex: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#7CE08A',
    borderWidth: 2,
    borderColor: '#fff',
  },
  hintOverlay: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  hintText: { color: '#fff' },
  toolbar: { padding: 12, gap: 10 },
  areaChip: { alignSelf: 'flex-start' },
  buttons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
