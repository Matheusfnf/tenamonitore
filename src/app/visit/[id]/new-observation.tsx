import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Chip,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { booleanPointInPolygon } from '@turf/turf';

import { FieldPolygons } from '@/components/FieldPolygons';
import { database } from '@/db';
import type { Farm, Field, Observation, ObservationPhoto, Threat, Visit } from '@/db/models';
import { useChildren, useCollection } from '@/db/useCollection';
import { fieldsToFeatureCollection, parseBoundary } from '@/lib/boundaries';
import { formatGeoPoint, getCurrentPosition, type GeoPoint } from '@/lib/location';
import { BRAZIL_CENTER, satelliteStyle } from '@/lib/mapStyle';
import { deleteLocalPhoto, persistPhoto } from '@/lib/photos';
import { SEVERITY_LABELS, SEVERITY_LEVELS } from '@/lib/severity';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

type ThreatKind = 'pest' | 'disease';

export default function NewObservationScreen() {
  const { id, lat: latParam, lng: lngParam, obsId } = useLocalSearchParams<{
    id: string;
    lat?: string;
    lng?: string;
    obsId?: string;
  }>();
  const router = useRouter();
  const { syncNow } = useSync();
  const insets = useSafeAreaInsets();
  const visitId = id ?? '';
  const isEditing = !!obsId;

  // Ponto pré-fixado (fluxo "toque no mapa da visita"): vem por parâmetro.
  const paramPin = useMemo<GeoPoint | null>(() => {
    const lat = parseFloat(latParam ?? '');
    const lng = parseFloat(lngParam ?? '');
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ponto escolhido no mapa da visita = só pré-visualização (não move o pin).
  const previewOnly = !!paramPin && !isEditing;

  const visit = useChildren<Visit>('visits', 'id', visitId)[0];
  const farm = useChildren<Farm>('farms', 'id', visit?.farmId ?? '')[0];
  const fields = useChildren<Field>('fields', 'farm_id', visit?.farmId ?? '');
  const threats = useCollection<Threat>('threats');
  const editing = useChildren<Observation>('observations', 'id', obsId ?? '')[0];
  const existingPhotos = useChildren<ObservationPhoto>(
    'observation_photos',
    'observation_id',
    obsId ?? '',
  );

  const [fieldId, setFieldId] = useState<string | null>(null);
  const [threatKind, setThreatKind] = useState<ThreatKind>('pest');
  const [threatId, setThreatId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<number | null>(null);
  const [incidence, setIncidence] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const keptExistingPhotos = existingPhotos.filter(
    (p) => p.localUri && !removedPhotoIds.includes(p.id),
  );

  // Pin do local da observação: se veio pré-fixado do mapa usa ele; senão
  // começa na posição GPS assim que houver fix. O consultor pode ajustar
  // tocando no mapa (ex.: marcar a reboleira do outro lado do talhão).
  const [pin, setPin] = useState<GeoPoint | null>(paramPin);
  const [locating, setLocating] = useState(!paramPin);
  const pinWasAdjusted = useRef(!!paramPin);
  const cameraRef = useRef<CameraRef>(null);

  // Com pin pré-fixado, o talhão é auto-selecionado assim que os polígonos
  // carregam do banco (uma vez só).
  const autoFieldDone = useRef(false);
  useEffect(() => {
    if (autoFieldDone.current || !paramPin || isEditing || fields.length === 0)
      return;
    autoFieldDone.current = true;
    autoSelectField(paramPin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.length]);

  // Modo edição: preenche o formulário quando o registro (e o catálogo,
  // se a observação tem ameaça) carregam. Roda uma vez só.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isEditing || prefilled.current || !editing) return;
    if (editing.threatId && threats.length === 0) return; // espera o catálogo
    prefilled.current = true;
    setFieldId(editing.fieldId);
    if (editing.threatId) {
      const threat = threats.find((t) => t.id === editing.threatId);
      if (threat) {
        setThreatKind(threat.type === 'disease' ? 'disease' : 'pest');
        setThreatId(threat.id);
      }
    }
    setSeverity(editing.severity);
    setIncidence(editing.incidence != null ? String(editing.incidence) : '');
    setNotes(editing.notes ?? '');
    if (editing.lat != null && editing.lng != null) {
      const point = { lat: editing.lat, lng: editing.lng };
      pinWasAdjusted.current = true;
      setPin(point);
      setLocating(false);
      cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 17 });
    }
  }, [isEditing, editing, threats]);

  const initialCenter = useMemo<[number, number]>(() => {
    if (farm?.centerLat != null && farm?.centerLng != null) {
      return [farm.centerLng, farm.centerLat];
    }
    return BRAZIL_CENTER;
  }, [farm]);

  const fieldPolygons = useMemo(
    () => fieldsToFeatureCollection(fields),
    [fields],
  );

  // Ao fixar o pin dentro de um talhão com polígono, seleciona-o sozinho.
  const autoSelectField = (point: GeoPoint) => {
    for (const f of fields) {
      const boundary = parseBoundary(f.boundary);
      if (boundary && booleanPointInPolygon([point.lng, point.lat], boundary)) {
        setFieldId(f.id);
        return;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    getCurrentPosition().then((point) => {
      if (cancelled) return;
      setLocating(false);
      if (point && !pinWasAdjusted.current) {
        setPin(point);
        autoSelectField(point);
        cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 17 });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centerOnMyPosition = async () => {
    setLocating(true);
    const point = await getCurrentPosition();
    setLocating(false);
    if (point) {
      pinWasAdjusted.current = true;
      setPin(point);
      autoSelectField(point);
      cameraRef.current?.jumpTo({ center: [point.lng, point.lat], zoom: 17 });
    } else {
      Alert.alert('GPS', 'Não foi possível obter sua posição.');
    }
  };

  const visibleThreats = useMemo(
    () => threats.filter((t) => t.type === threatKind),
    [threats, threatKind],
  );

  const addFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Câmera', 'Permissão de câmera negada.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const addFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled) {
      setPhotoUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotoUris((prev) => prev.filter((u) => u !== uri));
  };

  // Basta ter algo registrado: ameaça, nota ou foto.
  const hasContent =
    !!threatId ||
    notes.trim().length > 0 ||
    photoUris.length > 0 ||
    keptExistingPhotos.length > 0;
  const canSave = !!visit && hasContent && !saving && (!isEditing || !!editing);

  const onSave = async () => {
    if (!canSave || !visit) return;
    setSaving(true);
    try {
      const point = pin ?? (await getCurrentPosition());

      // Persiste as fotos ANTES do write: URIs do picker vivem em cache
      // e a cópia é assíncrona (não pode rodar dentro do database.write).
      const persistedUris: string[] = [];
      for (const uri of photoUris) {
        persistedUris.push(await persistPhoto(uri));
      }

      const parsedIncidence = parseFloat(incidence.replace(',', '.'));
      const applyFields = (o: Observation) => {
        o.fieldId = fieldId;
        o.threatId = threatId;
        o.severity = severity;
        o.incidence = Number.isFinite(parsedIncidence)
          ? Math.min(100, Math.max(0, parsedIncidence))
          : null;
        o.notes = notes.trim() || null;
        o.lat = point?.lat ?? null;
        o.lng = point?.lng ?? null;
      };

      const removed = existingPhotos.filter((p) =>
        removedPhotoIds.includes(p.id),
      );
      await database.write(async () => {
        let obs: Observation;
        if (isEditing && editing) {
          await editing.update(applyFields);
          obs = editing;
          for (const p of removed) {
            await p.markAsDeleted();
          }
        } else {
          obs = await database.get<Observation>('observations').create((o) => {
            o.visitId = visit.id;
            applyFields(o);
          });
        }
        for (const localUri of persistedUris) {
          await database.get<ObservationPhoto>('observation_photos').create((p) => {
            p.observationId = obs.id;
            p.localUri = localUri;
            p.storagePath = null;
            p.uploaded = false;
            p.lat = point?.lat ?? null;
            p.lng = point?.lng ?? null;
          });
        }
      });
      for (const p of removed) {
        if (p.localUri) deleteLocalPhoto(p.localUri);
      }
      void syncNow();
      router.back();
    } catch (e) {
      Alert.alert('Observação', `Não foi possível salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={isEditing ? 'Editar observação' : 'Nova observação'}
        />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[
          styles.form,
          { paddingBottom: 32 + insets.bottom },
        ]}
      >
        <Text variant="labelLarge">Local da observação</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {previewOnly
            ? 'Ponto escolhido no mapa da visita (pré-visualização).'
            : 'Toque no mapa para fixar o pin no ponto observado.'}
        </Text>
        <View style={styles.mapBox}>
          <MapLibreMap
            style={styles.map}
            mapStyle={satelliteStyle}
            attributionPosition={{ bottom: 4, left: 4 }}
            onPress={
              previewOnly
                ? undefined
                : (e) => {
                    const [lng, lat] = e.nativeEvent.lngLat;
                    pinWasAdjusted.current = true;
                    setPin({ lat, lng });
                    autoSelectField({ lat, lng });
                  }
            }
          >
            <Camera
              ref={cameraRef}
              initialViewState={{
                center: pin ? [pin.lng, pin.lat] : initialCenter,
                zoom: pin || initialCenter !== BRAZIL_CENTER ? 15 : 3.5,
              }}
            />
            <UserLocation />
            <FieldPolygons features={fieldPolygons} />
            {pin ? (
              <Marker lngLat={[pin.lng, pin.lat]} anchor="bottom">
                <MaterialCommunityIcons
                  name="map-marker"
                  size={38}
                  color="#E53935"
                  style={styles.pinShadow}
                />
              </Marker>
            ) : null}
          </MapLibreMap>
        </View>
        <View style={styles.gpsRow}>
          <Chip
            compact
            icon={pin ? 'map-marker-check' : locating ? 'crosshairs-question' : 'crosshairs-off'}
            style={styles.gpsChip}
          >
            {pin
              ? formatGeoPoint(pin)
              : locating
                ? 'Buscando sinal de GPS…'
                : 'Toque no mapa para marcar o ponto'}
          </Chip>
          {!previewOnly ? (
            <Button
              mode="text"
              icon="crosshairs-gps"
              compact
              loading={locating}
              onPress={() => void centerOnMyPosition()}
            >
              Minha posição
            </Button>
          ) : null}
        </View>

        <Text variant="labelLarge" style={styles.label}>
          Talhão
        </Text>
        <View style={styles.chips}>
          {fields.map((f) => (
            <Chip
              key={f.id}
              selected={fieldId === f.id}
              showSelectedCheck
              onPress={() => setFieldId(fieldId === f.id ? null : f.id)}
            >
              {f.name}
            </Chip>
          ))}
          {fields.length === 0 ? (
            <Text style={styles.muted}>
              Esta fazenda ainda não tem talhões cadastrados.
            </Text>
          ) : null}
        </View>

        <Text variant="labelLarge" style={styles.label}>
          Praga / Doença
        </Text>
        <SegmentedButtons
          value={threatKind}
          onValueChange={(v) => {
            setThreatKind(v as ThreatKind);
            setThreatId(null);
          }}
          buttons={[
            { value: 'pest', label: 'Praga', icon: 'bug' },
            { value: 'disease', label: 'Doença', icon: 'mushroom' },
          ]}
        />
        <View style={styles.chips}>
          {visibleThreats.map((t) => (
            <Chip
              key={t.id}
              selected={threatId === t.id}
              showSelectedCheck
              onPress={() => setThreatId(threatId === t.id ? null : t.id)}
            >
              {t.name}
            </Chip>
          ))}
          {visibleThreats.length === 0 ? (
            <Text style={styles.muted}>
              Catálogo vazio (sincronize para carregar).
            </Text>
          ) : null}
        </View>

        <Text variant="labelLarge" style={styles.label}>
          Severidade
        </Text>
        <View style={styles.chips}>
          {SEVERITY_LEVELS.map((level) => (
            <Chip
              key={level}
              selected={severity === level}
              showSelectedCheck
              onPress={() => setSeverity(severity === level ? null : level)}
            >
              {level} · {SEVERITY_LABELS[level]}
            </Chip>
          ))}
        </View>

        <TextInput
          label="Incidência (% de plantas afetadas)"
          value={incidence}
          onChangeText={setIncidence}
          keyboardType="decimal-pad"
          mode="outlined"
        />

        <TextInput
          label="Notas"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
        />

        <Text variant="labelLarge" style={styles.label}>
          Fotos ({keptExistingPhotos.length + photoUris.length})
        </Text>
        <View style={styles.photoButtons}>
          <Button mode="outlined" icon="camera" onPress={addFromCamera}>
            Câmera
          </Button>
          <Button mode="outlined" icon="image-multiple" onPress={addFromGallery}>
            Galeria
          </Button>
        </View>
        {keptExistingPhotos.length > 0 || photoUris.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={styles.photoRow}>
            {keptExistingPhotos.map((p) => (
              <View key={p.id} style={styles.photoWrap}>
                <Image
                  source={{ uri: p.localUri! }}
                  style={styles.photo}
                  contentFit="cover"
                />
                <IconButton
                  icon="close-circle"
                  size={20}
                  style={styles.photoRemove}
                  onPress={() =>
                    setRemovedPhotoIds((prev) => [...prev, p.id])
                  }
                />
              </View>
            ))}
            {photoUris.map((uri) => (
              <View key={uri} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photo} contentFit="cover" />
                <IconButton
                  icon="close-circle"
                  size={20}
                  style={styles.photoRemove}
                  onPress={() => removePhoto(uri)}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}

        <Button
          mode="contained"
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
          style={styles.button}
        >
          {isEditing ? 'Salvar alterações' : 'Salvar observação'}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  form: { padding: 16, gap: 12, paddingBottom: 32 },
  label: { marginTop: 4 },
  mapBox: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.outline,
  },
  map: { flex: 1 },
  pinShadow: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gpsChip: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { color: palette.textMuted },
  photoButtons: { flexDirection: 'row', gap: 8 },
  photoRow: { gap: 8 },
  photoWrap: { position: 'relative' },
  photo: { width: 96, height: 96, borderRadius: 8 },
  photoRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    margin: 0,
  },
  button: { marginTop: 8, paddingVertical: 4 },
});
