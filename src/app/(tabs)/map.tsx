import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  FAB,
  IconButton,
  Portal,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import { FieldPolygons } from '@/components/FieldPolygons';
import { database } from '@/db';
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
import { formatGeoPoint, getCurrentPosition, type GeoPoint } from '@/lib/location';
import { BRAZIL_CENTER, satelliteStyle } from '@/lib/mapStyle';
import { deleteLocalPhoto } from '@/lib/photos';
import { SEVERITY_LABELS } from '@/lib/severity';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

/** Cor do pin por tipo de ameaça. */
function pinColor(threatType: string | null): string {
  if (threatType === 'pest') return '#E53935';
  if (threatType === 'disease') return '#8E24AA';
  return '#546E7A';
}

export default function MapScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const router = useRouter();
  const { profile } = useAuth();
  const { syncNow } = useSync();
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
  const selectedIsOpen = selectedVisit?.status === 'open';

  // ---- nova visita direto do mapa ------------------------------------------
  const [startOpen, setStartOpen] = useState(false);
  const [visitName, setVisitName] = useState('');
  const [startFarmId, setStartFarmId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const openStartDialog = () => {
    setVisitName('');
    setStartFarmId(farms.length === 1 ? farms[0].id : null);
    setStartOpen(true);
    // Pré-seleciona a fazenda mais próxima da posição atual (se houver GPS).
    getCurrentPosition().then((point) => {
      if (!point) return;
      let best: { id: string; d: number } | null = null;
      for (const f of farms) {
        if (f.centerLat == null || f.centerLng == null) continue;
        const d =
          (f.centerLat - point.lat) ** 2 + (f.centerLng - point.lng) ** 2;
        if (!best || d < best.d) best = { id: f.id, d };
      }
      if (best) setStartFarmId((prev) => prev ?? best!.id);
    });
  };

  const onStartVisit = async () => {
    if (!startFarmId || !profile || starting) return;
    setStarting(true);
    try {
      const point = await getCurrentPosition();
      let newId = '';
      await database.write(async () => {
        const visit = await database.get<Visit>('visits').create((v) => {
          v.farmId = startFarmId;
          v.consultantId = profile.id;
          v.name = visitName.trim() || null;
          v.visitDate = new Date().toISOString().slice(0, 10);
          v.status = 'open';
          v.weather = null;
          v.notes = null;
          v.lat = point?.lat ?? null;
          v.lng = point?.lng ?? null;
        });
        newId = visit.id;
      });
      void syncNow();
      userChoseRef.current = true;
      setSelectedVisitId(newId);
      setStartOpen(false);
      if (point) {
        cameraRef.current?.flyTo({
          center: [point.lng, point.lat],
          zoom: 16,
          duration: 600,
        });
      }
    } finally {
      setStarting(false);
    }
  };

  // O MapLibre pode demorar a carregar o estilo na 1ª abertura; interagir
  // nesse meio-tempo crashava e o TextureView ainda mostrava o último frame
  // renderizado (fazenda antiga). O overlay fica até o estilo carregar E a
  // câmera fazer o 1º posicionamento (fit dos pins ou salto pro GPS) — com
  // fallback de 12s caso os eventos não cheguem.
  const [mapLoaded, setMapLoaded] = useState(false);
  const [cameraPositioned, setCameraPositioned] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setMapLoaded(true);
      setCameraPositioned(true);
    }, 12000);
    return () => clearTimeout(t);
  }, []);

  // ---- excluir observação (pelo card do pin) --------------------------------
  const [deleteObsOpen, setDeleteObsOpen] = useState(false);
  const [deletingObs, setDeletingObs] = useState(false);

  // ---- encerrar visita direto do mapa --------------------------------------
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closingVisit, setClosingVisit] = useState(false);

  const onCloseVisitFromMap = async () => {
    if (!selectedVisit || closingVisit) return;
    setClosingVisit(true);
    try {
      await database.write(async () => {
        await selectedVisit.update((v) => {
          v.status = 'closed';
        });
      });
      setCloseConfirmOpen(false);
      setPendingPin(null);
      void syncNow();
    } catch (e) {
      Alert.alert('Visita', `Não foi possível encerrar: ${String(e)}`);
    } finally {
      setClosingVisit(false);
    }
  };

  // ---- pin pendente (toque no mapa durante visita aberta) ------------------
  const [pendingPin, setPendingPin] = useState<GeoPoint | null>(null);

  // O toque num Marker também dispara o onPress do MAPA, que limparia a
  // seleção (ou criaria pin fantasma por cima). Solução: a ação do mapa roda
  // com 200ms de atraso e é cancelada quando o toque veio de um pin.
  const mapPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerPressedAt = useRef(0);
  const cancelMapPress = () => {
    if (mapPressTimer.current) {
      clearTimeout(mapPressTimer.current);
      mapPressTimer.current = null;
    }
  };
  const onMarkerPress = (obsId: string) => {
    markerPressedAt.current = Date.now();
    cancelMapPress();
    setPendingPin(null);
    setSelectedObsId(obsId);
  };
  useEffect(() => cancelMapPress, []);

  const confirmPendingPin = () => {
    if (!pendingPin || !selectedVisitId) return;
    const { lat, lng } = pendingPin;
    setPendingPin(null);
    router.push(
      `/visit/${selectedVisitId}/new-observation?lat=${lat}&lng=${lng}` as Href,
    );
  };

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

  const onDeleteObservation = async () => {
    if (!selectedObs || deletingObs) return;
    setDeletingObs(true);
    try {
      const obsPhotos = photosByObs.get(selectedObs.id) ?? [];
      await database.write(async () => {
        for (const p of obsPhotos) {
          await p.markAsDeleted();
        }
        await selectedObs.markAsDeleted();
      });
      for (const p of obsPhotos) {
        if (p.localUri) deleteLocalPhoto(p.localUri);
      }
      setDeleteObsOpen(false);
      setSelectedObsId(null);
      void syncNow();
    } catch (e) {
      Alert.alert('Observação', `Não foi possível excluir: ${String(e)}`);
    } finally {
      setDeletingObs(false);
    }
  };

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

  // Ao trocar a visita (e após o mapa carregar): enquadra os pins;
  // sem pins/seleção, centra no usuário. O 1º posicionamento libera o overlay.
  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;
    if (pins.length > 0) {
      // pequeno delay p/ o mapa montar a câmera antes do fit
      const t = setTimeout(() => {
        fitToPins(pins);
        setCameraPositioned(true);
      }, 300);
      return () => clearTimeout(t);
    }
    getCurrentPosition().then((point) => {
      if (cancelled) return;
      if (point) {
        cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 15 });
      }
      setCameraPositioned(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVisitId, mapLoaded]);

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
    v.name?.trim()
      ? v.name
      : `${farmById.get(v.farmId)?.name ?? 'Fazenda'} · ${formatVisitDate(v.visitDate)}`;

  return (
    <View style={styles.root}>
      <MapLibreMap
        style={styles.map}
        mapStyle={satelliteStyle}
        attributionPosition={{ bottom: 8, left: 8 }}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
        onPress={(e) => {
          // toque que veio de um pin (o Marker também propaga pro mapa)
          if (Date.now() - markerPressedAt.current < 300) return;
          const [lng, lat] = e.nativeEvent.lngLat;
          cancelMapPress();
          mapPressTimer.current = setTimeout(() => {
            mapPressTimer.current = null;
            setSelectedObsId(null);
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            // Durante uma visita aberta, o toque propõe um pin de observação.
            if (selectedIsOpen) {
              setPendingPin({ lat, lng });
            } else {
              setPendingPin(null);
            }
          }, 200);
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
        {mapLoaded ? <FieldPolygons features={fieldPolygons} /> : null}

        {mapLoaded && farms
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

        {mapLoaded && pins.map((o, index) => {
          const threat = o.threatId ? threatById.get(o.threatId) : null;
          const isSelected = o.id === selectedObsId;
          return (
            <Marker
              key={o.id}
              lngLat={[o.lng!, o.lat!]}
              onPress={() => onMarkerPress(o.id)}
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

        {mapLoaded && pendingPin ? (
          <Marker
            lngLat={[pendingPin.lng, pendingPin.lat]}
            anchor="bottom"
          >
            <MaterialCommunityIcons
              name="map-marker-plus"
              size={38}
              color="#FFD54F"
              style={styles.ghostPin}
            />
          </Marker>
        ) : null}
      </MapLibreMap>

      {/* ---- seletor de visita (recolhível) ---- */}
      <View style={styles.menuWrap}>
        <View style={styles.menuRow0}>
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

        </View>

        {selectedVisit && !menuOpen ? (
          <View style={styles.actionRow}>
            <TouchableRipple
              style={styles.editPill}
              borderless
              onPress={() =>
                router.push(`/visit/${selectedVisit.id}` as Href)
              }
            >
              <View style={styles.menuPillInner}>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color={palette.green}
                />
                <Text variant="labelMedium" style={styles.pillLabel}>
                  {selectedIsOpen ? 'Editar visita' : 'Ver visita'}
                </Text>
              </View>
            </TouchableRipple>

            {selectedIsOpen ? (
              <TouchableRipple
                style={styles.editPill}
                borderless
                onPress={() => setCloseConfirmOpen(true)}
              >
                <View style={styles.menuPillInner}>
                  <MaterialCommunityIcons
                    name="flag-checkered"
                    size={16}
                    color={palette.red}
                  />
                  <Text
                    variant="labelMedium"
                    style={[styles.pillLabel, { color: palette.red }]}
                  >
                    Encerrar
                  </Text>
                </View>
              </TouchableRipple>
            ) : null}
          </View>
        ) : null}

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
        {selectedIsOpen && pins.length === 0 && !pendingPin && !menuOpen ? (
          <View style={styles.hintPill}>
            <Text variant="labelSmall" style={styles.hintText}>
              Toque no mapa para marcar uma observação
            </Text>
          </View>
        ) : null}
      </View>

      {/* ---- confirmação do pin pendente ---- */}
      {pendingPin ? (
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons
              name="map-marker-plus"
              size={26}
              color={palette.amber}
            />
            <View style={styles.infoTitleBox}>
              <Text variant="titleMedium" style={styles.infoTitle}>
                Registrar observação aqui?
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                {formatGeoPoint(pendingPin)}
              </Text>
            </View>
          </View>
          <View style={styles.confirmButtons}>
            <Button mode="text" onPress={() => setPendingPin(null)}>
              Cancelar
            </Button>
            <Button mode="contained" icon="plus" onPress={confirmPendingPin}>
              Registrar
            </Button>
          </View>
        </View>
      ) : null}

      {/* ---- card de detalhes do pin ---- */}
      {selectedObs && !pendingPin ? (
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

          <View style={styles.confirmButtons}>
            <Button
              mode="text"
              icon="delete-outline"
              textColor={palette.red}
              onPress={() => setDeleteObsOpen(true)}
            >
              Excluir
            </Button>
            <Button
              mode="outlined"
              icon="pencil-outline"
              onPress={() => {
                const obsId = selectedObs.id;
                setSelectedObsId(null);
                router.push(
                  `/visit/${selectedObs.visitId}/new-observation?obsId=${obsId}` as Href,
                );
              }}
            >
              Editar
            </Button>
          </View>
        </View>
      ) : null}

      <FAB
        icon="crosshairs-gps"
        size="small"
        style={styles.locateFab}
        color={palette.green}
        onPress={() => void recenter()}
      />

      {!selectedIsOpen ? (
        <FAB
          icon="plus"
          label="Nova visita"
          color="#fff"
          style={styles.newVisitFab}
          onPress={openStartDialog}
        />
      ) : null}

      {/* ---- carregando: bloqueia até o estilo carregar e a câmera posicionar ---- */}
      {!mapLoaded || !cameraPositioned ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={palette.green} />
          <Text variant="bodyMedium" style={styles.loadingText}>
            {mapLoaded ? 'Localizando…' : 'Carregando mapa…'}
          </Text>
        </View>
      ) : null}

      {/* ---- diálogos ---- */}
      <Portal>
        <Dialog
          visible={deleteObsOpen}
          onDismiss={() => setDeleteObsOpen(false)}
        >
          <Dialog.Title>Excluir observação</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              O pin {selectedIndex + 1}
              {selectedThreat ? ` (${selectedThreat.name})` : ''} e suas fotos
              serão removidos. Essa ação não pode ser desfeita.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteObsOpen(false)}>Cancelar</Button>
            <Button
              loading={deletingObs}
              textColor={palette.red}
              onPress={onDeleteObservation}
            >
              Excluir
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal>
        <Dialog
          visible={closeConfirmOpen}
          onDismiss={() => setCloseConfirmOpen(false)}
        >
          <Dialog.Title>Encerrar visita</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {selectedVisit ? visitLabel(selectedVisit) : ''} — {pins.length}{' '}
              observaç{pins.length === 1 ? 'ão' : 'ões'} registrada
              {pins.length === 1 ? '' : 's'}. Após encerrar, não é possível
              adicionar novos pins.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCloseConfirmOpen(false)}>Cancelar</Button>
            <Button
              loading={closingVisit}
              textColor={palette.red}
              onPress={onCloseVisitFromMap}
            >
              Encerrar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal>
        <Dialog visible={startOpen} onDismiss={() => setStartOpen(false)}>
          <Dialog.Title>Nova visita</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              label="Nome da visita (opcional)"
              placeholder="Ex.: Monitoramento semanal"
              value={visitName}
              onChangeText={setVisitName}
              mode="outlined"
            />
            <Text variant="labelLarge">Fazenda *</Text>
            {farms.length === 0 ? (
              <Text variant="bodySmall" style={styles.muted}>
                Nenhuma fazenda disponível (sincronize para carregar).
              </Text>
            ) : (
              <ScrollView style={styles.dialogFarms}>
                <View style={styles.dialogChips}>
                  {farms.map((f) => (
                    <Chip
                      key={f.id}
                      selected={startFarmId === f.id}
                      showSelectedCheck
                      onPress={() => setStartFarmId(f.id)}
                    >
                      {f.name}
                    </Chip>
                  ))}
                </View>
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setStartOpen(false)}>Cancelar</Button>
            <Button
              loading={starting}
              disabled={!startFarmId || starting}
              onPress={onStartVisit}
            >
              Iniciar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  menuRow0: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuPill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexShrink: 1,
  },
  editPill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pillLabel: { fontWeight: '700' },
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
  newVisitFab: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    backgroundColor: palette.green,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: palette.textMuted },
  ghostPin: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  dialogContent: { gap: 10 },
  dialogFarms: { maxHeight: 220 },
  dialogChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
