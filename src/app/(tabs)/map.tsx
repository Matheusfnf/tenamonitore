import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FAB, IconButton, Text, TouchableRipple } from 'react-native-paper';

import { FieldPolygons } from '@/components/FieldPolygons';
import type {
  Farm,
  Field,
  Observation,
  ObservationPhoto,
  Threat,
  Visit,
} from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { fieldsToFeatureCollection } from '@/lib/boundaries';
import { formatVisitDate } from '@/lib/dates';
import { getCurrentPosition } from '@/lib/location';
import { BRAZIL_CENTER, satelliteStyle } from '@/lib/mapStyle';
import { SEVERITY_LABELS } from '@/lib/severity';
import { palette } from '@/lib/theme';

/** Cor do pin por tipo de ameaça. */
function pinColor(threatType: string | null): string {
  if (threatType === 'pest') return '#E53935';
  if (threatType === 'disease') return '#8E24AA';
  return '#546E7A';
}

export default function MapScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const observations = useCollection<Observation>('observations');
  const visits = useCollection<Visit>('visits');
  const farms = useCollection<Farm>('farms');
  const fields = useCollection<Field>('fields');
  const threats = useCollection<Threat>('threats');
  const photos = useCollection<ObservationPhoto>('observation_photos');

  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits]);
  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const threatById = useMemo(() => new Map(threats.map((t) => [t.id, t])), [threats]);
  const photosByObs = useMemo(() => {
    const map = new Map<string, ObservationPhoto[]>();
    for (const p of photos) {
      const list = map.get(p.observationId) ?? [];
      list.push(p);
      map.set(p.observationId, list);
    }
    return map;
  }, [photos]);

  const fieldPolygons = useMemo(
    () => fieldsToFeatureCollection(fields),
    [fields],
  );

  // ---- seleção de visita ---------------------------------------------------
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const userChoseRef = useRef(false); // não re-selecionar após "limpar"

  const sortedVisits = useMemo(
    () =>
      [...visits].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }),
    [visits],
  );

  // Visita em andamento entra selecionada sozinha (consultor no campo).
  useEffect(() => {
    if (userChoseRef.current || selectedVisitId) return;
    const open = visits.find((v) => v.status === 'open');
    if (open) setSelectedVisitId(open.id);
  }, [visits, selectedVisitId]);

  // Se a visita selecionada sumir (delete/sync), limpa.
  useEffect(() => {
    if (selectedVisitId && !visitById.has(selectedVisitId)) {
      setSelectedVisitId(null);
    }
  }, [selectedVisitId, visitById]);

  const selectedVisit = selectedVisitId
    ? visitById.get(selectedVisitId)
    : undefined;

  /** Pins: só da visita selecionada, na ordem de criação (numerados). */
  const pins = useMemo(() => {
    if (!selectedVisitId) return [];
    return observations
      .filter(
        (o) => o.visitId === selectedVisitId && o.lat != null && o.lng != null,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [observations, selectedVisitId]);

  const obsCountByVisit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of observations) {
      if (o.lat != null && o.lng != null) {
        counts.set(o.visitId, (counts.get(o.visitId) ?? 0) + 1);
      }
    }
    return counts;
  }, [observations]);

  // ---- pin selecionado (card de detalhes) ---------------------------------
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const selectedIndex = pins.findIndex((o) => o.id === selectedObsId);
  const selectedObs = selectedIndex >= 0 ? pins[selectedIndex] : null;
  const selectedThreat = selectedObs?.threatId
    ? threatById.get(selectedObs.threatId)
    : null;
  const selectedPhotos = selectedObs
    ? (photosByObs.get(selectedObs.id) ?? []).filter((p) => p.localUri)
    : [];

  // ---- câmera ---------------------------------------------------------------
  const initialCenter = useMemo<[number, number]>(() => {
    const farm = farms.find((f) => f.centerLat != null && f.centerLng != null);
    if (farm) return [farm.centerLng!, farm.centerLat!];
    return BRAZIL_CENTER;
  }, [farms]);

  /** Enquadra os pins da visita selecionada. */
  const fitToPins = (list: Observation[]) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      cameraRef.current?.flyTo({
        center: [list[0].lng!, list[0].lat!],
        zoom: 16,
        duration: 700,
      });
      return;
    }
    const lngs = list.map((o) => o.lng!);
    const lats = list.map((o) => o.lat!);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: { top: 140, bottom: 160, left: 70, right: 70 },
        duration: 700,
      },
    );
  };

  // Ao trocar a visita: enquadra os pins; sem pins/seleção, centra no usuário.
  useEffect(() => {
    let cancelled = false;
    if (pins.length > 0) {
      // pequeno delay p/ o mapa montar a câmera antes do fit
      const t = setTimeout(() => fitToPins(pins), 300);
      return () => clearTimeout(t);
    }
    getCurrentPosition().then((point) => {
      if (!cancelled && point) {
        cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 15 });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVisitId]);

  const recenter = async () => {
    const point = await getCurrentPosition();
    if (point) {
      cameraRef.current?.flyTo({
        center: [point.lng, point.lat],
        zoom: 16,
        duration: 600,
      });
    }
  };

  const selectVisit = (visitId: string | null) => {
    userChoseRef.current = true;
    setSelectedObsId(null);
    setSelectedVisitId(visitId);
    setMenuOpen(false);
  };

  const visitLabel = (v: Visit) =>
    `${farmById.get(v.farmId)?.name ?? 'Fazenda'} · ${formatVisitDate(v.visitDate)}`;

  return (
    <View style={styles.root}>
      <MapLibreMap
        style={styles.map}
        mapStyle={satelliteStyle}
        attributionPosition={{ bottom: 8, left: 8 }}
        onPress={() => {
          setSelectedObsId(null);
          setMenuOpen(false);
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: initialCenter,
            zoom: initialCenter === BRAZIL_CENTER ? 3.5 : 13,
          }}
        />
        <UserLocation />
        <FieldPolygons features={fieldPolygons} />

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

        {pins.map((o, index) => {
          const threat = o.threatId ? threatById.get(o.threatId) : null;
          const isSelected = o.id === selectedObsId;
          return (
            <Marker
              key={o.id}
              lngLat={[o.lng!, o.lat!]}
              onPress={() => setSelectedObsId(o.id)}
            >
              <View
                style={[
                  styles.obsPin,
                  { backgroundColor: pinColor(threat?.type ?? null) },
                  isSelected && styles.obsPinSelected,
                ]}
              >
                <Text style={styles.obsPinText}>{index + 1}</Text>
              </View>
            </Marker>
          );
        })}
      </MapLibreMap>

      {/* ---- seletor de visita (recolhível) ---- */}
      <View style={styles.menuWrap}>
        <TouchableRipple
          style={styles.menuPill}
          borderless
          onPress={() => setMenuOpen((v) => !v)}
        >
          <View style={styles.menuPillInner}>
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={16}
              color={palette.green}
            />
            <Text variant="labelMedium" style={styles.menuPillText} numberOfLines={1}>
              {selectedVisit ? visitLabel(selectedVisit) : 'Escolher visita'}
            </Text>
            {selectedVisit?.status === 'open' ? (
              <View style={styles.openDot} />
            ) : null}
            <MaterialCommunityIcons
              name={menuOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={palette.textMuted}
            />
          </View>
        </TouchableRipple>

        {menuOpen ? (
          <View style={styles.menuCard}>
            <ScrollView style={styles.menuList}>
              {sortedVisits.length === 0 ? (
                <Text variant="bodySmall" style={styles.menuEmpty}>
                  Nenhuma visita ainda.
                </Text>
              ) : (
                sortedVisits.map((v) => {
                  const active = v.id === selectedVisitId;
                  const count = obsCountByVisit.get(v.id) ?? 0;
                  return (
                    <TouchableRipple
                      key={v.id}
                      onPress={() => selectVisit(v.id)}
                      style={[styles.menuRow, active && styles.menuRowActive]}
                    >
                      <View style={styles.menuRowInner}>
                        <MaterialCommunityIcons
                          name={
                            v.status === 'open'
                              ? 'progress-clock'
                              : 'check-circle-outline'
                          }
                          size={18}
                          color={v.status === 'open' ? palette.amber : palette.green}
                        />
                        <View style={styles.menuRowTexts}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {visitLabel(v)}
                          </Text>
                          <Text variant="bodySmall" style={styles.muted}>
                            {v.status === 'open' ? 'Em andamento · ' : ''}
                            {count} pin{count === 1 ? '' : 's'}
                          </Text>
                        </View>
                        {active ? (
                          <MaterialCommunityIcons
                            name="check"
                            size={18}
                            color={palette.green}
                          />
                        ) : null}
                      </View>
                    </TouchableRipple>
                  );
                })
              )}
            </ScrollView>
            {selectedVisitId ? (
              <TouchableRipple
                onPress={() => selectVisit(null)}
                style={styles.menuClear}
              >
                <Text variant="labelMedium" style={styles.menuClearText}>
                  Limpar seleção (ocultar pins)
                </Text>
              </TouchableRipple>
            ) : null}
          </View>
        ) : null}

        {!selectedVisitId && !menuOpen ? (
          <View style={styles.hintPill}>
            <Text variant="labelSmall" style={styles.hintText}>
              Selecione uma visita para ver os pins
            </Text>
          </View>
        ) : null}
      </View>

      {/* ---- card de detalhes do pin ---- */}
      {selectedObs ? (
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View
              style={[
                styles.infoNumber,
                { backgroundColor: pinColor(selectedThreat?.type ?? null) },
              ]}
            >
              <Text style={styles.infoNumberText}>{selectedIndex + 1}</Text>
            </View>
            <View style={styles.infoTitleBox}>
              <Text variant="titleMedium" style={styles.infoTitle} numberOfLines={1}>
                {selectedThreat?.name ?? 'Observação geral'}
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                {[
                  selectedThreat
                    ? selectedThreat.type === 'disease'
                      ? 'Doença'
                      : 'Praga'
                    : null,
                  selectedObs.fieldId
                    ? `Talhão ${fieldById.get(selectedObs.fieldId)?.name ?? ''}`
                    : null,
                  selectedObs.createdAt.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <IconButton
              icon="close"
              size={18}
              onPress={() => setSelectedObsId(null)}
            />
          </View>

          {selectedObs.severity != null || selectedObs.incidence != null ? (
            <Text variant="bodySmall">
              {[
                selectedObs.severity != null
                  ? `Severidade: ${selectedObs.severity} — ${SEVERITY_LABELS[selectedObs.severity] ?? ''}`
                  : null,
                selectedObs.incidence != null
                  ? `Incidência: ${selectedObs.incidence}%`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}

          {selectedObs.notes ? (
            <Text variant="bodySmall" style={styles.muted} numberOfLines={3}>
              {selectedObs.notes}
            </Text>
          ) : null}

          {selectedPhotos.length > 0 ? (
            <ScrollView horizontal contentContainerStyle={styles.photoRow}>
              {selectedPhotos.map((p) => (
                <Image
                  key={p.id}
                  source={{ uri: p.localUri! }}
                  style={styles.photo}
                  contentFit="cover"
                />
              ))}
            </ScrollView>
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
  farmPin: {
    backgroundColor: palette.green,
    borderRadius: 999,
    padding: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  obsPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 3,
  },
  obsPinSelected: {
    transform: [{ scale: 1.25 }],
    borderColor: '#FFD54F',
  },
  obsPinText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  menuWrap: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  menuPill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '100%',
  },
  menuPillInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuPillText: { fontWeight: '700', flexShrink: 1 },
  openDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.amber,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    elevation: 6,
    overflow: 'hidden',
  },
  menuList: { maxHeight: 300 },
  menuEmpty: { padding: 16, color: palette.textMuted },
  menuRow: { paddingHorizontal: 14, paddingVertical: 10 },
  menuRowActive: { backgroundColor: palette.greenSoft },
  menuRowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuRowTexts: { flex: 1 },
  menuClear: {
    borderTopWidth: 1,
    borderTopColor: palette.outline,
    paddingVertical: 12,
    alignItems: 'center',
  },
  menuClearText: { color: palette.red, fontWeight: '700' },
  hintPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hintText: { color: '#fff' },
  muted: { color: palette.textMuted },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 76,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    elevation: 4,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoNumberText: { color: '#fff', fontWeight: '800' },
  infoTitleBox: { flex: 1 },
  infoTitle: { fontWeight: '700' },
  photoRow: { gap: 8, paddingTop: 4 },
  photo: { width: 64, height: 64, borderRadius: 8 },
  locateFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#fff',
  },
});
