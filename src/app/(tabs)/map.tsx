import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FAB, Text } from 'react-native-paper';

import type { Farm, Field, Observation, Threat, Visit } from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { formatVisitDate } from '@/lib/dates';
import { getCurrentPosition } from '@/lib/location';
import { BRAZIL_CENTER, satelliteStyle } from '@/lib/mapStyle';
import { SEVERITY_LABELS } from '@/lib/severity';
import { palette } from '@/lib/theme';

export default function MapScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const observations = useCollection<Observation>('observations');
  const visits = useCollection<Visit>('visits');
  const farms = useCollection<Farm>('farms');
  const fields = useCollection<Field>('fields');
  const threats = useCollection<Threat>('threats');

  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits]);
  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const threatById = useMemo(() => new Map(threats.map((t) => [t.id, t])), [threats]);

  const located = useMemo(
    () => observations.filter((o) => o.lat != null && o.lng != null),
    [observations],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = located.find((o) => o.id === selectedId) ?? null;
  const selectedVisit = selected ? visitById.get(selected.visitId) : null;
  const selectedThreat = selected?.threatId
    ? threatById.get(selected.threatId)
    : null;

  // Câmera inicial: última observação > centro de fazenda > Brasil.
  const initialCenter = useMemo<[number, number]>(() => {
    const last = located[located.length - 1];
    if (last) return [last.lng!, last.lat!];
    const farm = farms.find((f) => f.centerLat != null && f.centerLng != null);
    if (farm) return [farm.centerLng!, farm.centerLat!];
    return BRAZIL_CENTER;
  }, [located, farms]);
  const initialZoom = initialCenter === BRAZIL_CENTER ? 3.5 : 13;

  // Ao abrir a aba, tenta centralizar no usuário (pede permissão se preciso).
  useEffect(() => {
    let cancelled = false;
    getCurrentPosition().then((point) => {
      if (!cancelled && point) {
        cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 15 });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recenter = async () => {
    const point = await getCurrentPosition();
    if (point) {
      cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 16 });
    }
  };

  return (
    <View style={styles.root}>
      <MapLibreMap
        style={styles.map}
        mapStyle={satelliteStyle}
        attributionPosition={{ bottom: 8, left: 8 }}
        onPress={() => setSelectedId(null)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: initialCenter, zoom: initialZoom }}
        />
        <UserLocation />

        {farms
          .filter((f) => f.centerLat != null && f.centerLng != null)
          .map((f) => (
            <Marker
              key={`farm-${f.id}`}
              lngLat={[f.centerLng!, f.centerLat!]}
              anchor="bottom"
            >
              <View style={styles.farmPin}>
                <MaterialCommunityIcons name="barn" size={16} color="#fff" />
              </View>
            </Marker>
          ))}

        {located.map((o) => (
          <Marker
            key={o.id}
            lngLat={[o.lng!, o.lat!]}
            anchor="bottom"
            onPress={() => setSelectedId(o.id)}
          >
            <MaterialCommunityIcons
              name="map-marker"
              size={34}
              color={selectedId === o.id ? palette.amber : '#E53935'}
              style={styles.pinShadow}
            />
          </Marker>
        ))}
      </MapLibreMap>

      <View style={styles.headerOverlay}>
        <Text variant="titleMedium" style={styles.headerText}>
          {located.length} observaç{located.length === 1 ? 'ão' : 'ões'} no mapa
        </Text>
      </View>

      {selected ? (
        <View style={styles.infoCard}>
          <Text variant="titleMedium" style={styles.infoTitle}>
            {selectedThreat?.name ?? 'Observação geral'}
          </Text>
          <Text variant="bodySmall" style={styles.infoMuted}>
            {[
              selectedVisit
                ? farmById.get(selectedVisit.farmId)?.name
                : null,
              selected.fieldId
                ? `Talhão ${fieldById.get(selected.fieldId)?.name ?? ''}`
                : null,
              selectedVisit ? formatVisitDate(selectedVisit.visitDate) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {selected.severity != null ? (
            <Text variant="bodySmall" style={styles.infoMuted}>
              Severidade: {selected.severity} —{' '}
              {SEVERITY_LABELS[selected.severity] ?? ''}
              {selected.incidence != null
                ? ` · Incidência: ${selected.incidence}%`
                : ''}
            </Text>
          ) : null}
          {selected.notes ? (
            <Text variant="bodySmall" numberOfLines={2}>
              {selected.notes}
            </Text>
          ) : null}
        </View>
      ) : null}

      <FAB
        icon="crosshairs-gps"
        size="small"
        style={styles.locateFab}
        color={palette.green}
        onPress={() => void recenter()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerText: { fontWeight: '700' },
  farmPin: {
    backgroundColor: palette.green,
    borderRadius: 999,
    padding: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinShadow: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 76,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 4,
    elevation: 4,
  },
  infoTitle: { fontWeight: '700' },
  infoMuted: { color: palette.textMuted },
  locateFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#fff',
  },
});
