import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';

import { database } from '@/db';
import type {
  Farm,
  Field,
  Observation,
  ObservationPhoto,
  Report,
  Threat,
  Visit,
} from '@/db/models';
import { useChildren, useCollection } from '@/db/useCollection';
import { formatVisitDate } from '@/lib/dates';
import { SEVERITY_LABELS } from '@/lib/severity';
import { palette } from '@/lib/theme';
import { shareVisitReport } from '@/reports/visitReport';
import { useSync } from '@/sync/SyncProvider';

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { syncNow } = useSync();
  const visitId = id ?? '';

  const visit = useChildren<Visit>('visits', 'id', visitId)[0];
  const observations = useChildren<Observation>('observations', 'visit_id', visitId);
  const farms = useCollection<Farm>('farms');
  const fields = useCollection<Field>('fields');
  const threats = useCollection<Threat>('threats');
  const photos = useCollection<ObservationPhoto>('observation_photos');

  const farm = useMemo(
    () => farms.find((f) => f.id === visit?.farmId),
    [farms, visit],
  );
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

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const isOpen = visit?.status === 'open';

  const onCloseVisit = async () => {
    if (!visit || closing) return;
    setClosing(true);
    try {
      await database.write(async () => {
        await visit.update((v) => {
          v.status = 'closed';
          const extra = closeNotes.trim();
          if (extra) {
            v.notes = v.notes ? `${v.notes}\n${extra}` : extra;
          }
        });
      });
      setCloseDialogOpen(false);
      setCloseNotes('');
      void syncNow();
    } finally {
      setClosing(false);
    }
  };

  const onShareReport = async () => {
    if (!visit || sharing) return;
    setSharing(true);
    try {
      await shareVisitReport({
        farmName: farm?.name ?? 'Fazenda',
        ownerName: farm?.ownerName ?? null,
        location:
          [farm?.municipality, farm?.state].filter(Boolean).join(' - ') || null,
        visitDate: formatVisitDate(visit.visitDate),
        weather: visit.weather,
        notes: visit.notes,
        lat: visit.lat,
        lng: visit.lng,
        observations: observations.map((o) => {
          const threat = o.threatId ? threatById.get(o.threatId) : undefined;
          return {
            fieldName: (o.fieldId && fieldById.get(o.fieldId)?.name) || null,
            threatName: threat?.name ?? null,
            threatType: threat?.type ?? null,
            severity: o.severity,
            incidence: o.incidence,
            notes: o.notes,
            lat: o.lat,
            lng: o.lng,
            photoUris: (photosByObs.get(o.id) ?? [])
              .map((p) => p.localUri)
              .filter((u): u is string => !!u),
          };
        }),
      });
      // Registra a geração do relatório (sincroniza p/ acompanhamento do admin).
      await database.write(async () => {
        await database.get<Report>('reports').create((r) => {
          r.visitId = visit.id;
          r.summary = `${observations.length} observaç${observations.length === 1 ? 'ão' : 'ões'} em ${farm?.name ?? 'fazenda'}`;
          r.generatedAt = new Date().toISOString();
          r.pdfPath = null;
        });
      });
      void syncNow();
    } catch (e) {
      Alert.alert('Relatório', `Não foi possível gerar o PDF: ${String(e)}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={farm?.name ?? 'Visita'}
          subtitle={visit ? formatVisitDate(visit.visitDate) : ''}
        />
      </Appbar.Header>

      <FlatList
        data={observations}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          visit ? (
            <View style={styles.header}>
              <View style={styles.chips}>
                <Chip compact icon={isOpen ? 'progress-clock' : 'check-circle'}>
                  {isOpen ? 'Em andamento' : 'Encerrada'}
                </Chip>
                {visit.weather ? (
                  <Chip compact icon="weather-partly-cloudy">
                    {visit.weather}
                  </Chip>
                ) : null}
                {visit.lat != null && visit.lng != null ? (
                  <Chip compact icon="crosshairs-gps">
                    GPS registrado
                  </Chip>
                ) : null}
              </View>
              {visit.notes ? (
                <Text variant="bodyMedium" style={styles.muted}>
                  {visit.notes}
                </Text>
              ) : null}
              <Text variant="titleSmall" style={styles.sectionTitle}>
                Observações ({observations.length})
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isOpen
              ? 'Nenhuma observação ainda. Fixe um pin no mapa e registre o que encontrar.'
              : 'Visita encerrada sem observações.'}
          </Text>
        }
        ListFooterComponent={
          visit ? (
            <View style={styles.footer}>
              {isOpen ? (
                <Button
                  mode="outlined"
                  icon="flag-checkered"
                  onPress={() => setCloseDialogOpen(true)}
                >
                  Encerrar visita
                </Button>
              ) : (
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  loading={sharing}
                  disabled={sharing}
                  onPress={onShareReport}
                >
                  Compartilhar relatório (PDF)
                </Button>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const threat = item.threatId ? threatById.get(item.threatId) : undefined;
          const fieldName = item.fieldId
            ? fieldById.get(item.fieldId)?.name
            : undefined;
          const photoCount = photosByObs.get(item.id)?.length ?? 0;
          const details = [
            item.severity != null
              ? `Severidade: ${SEVERITY_LABELS[item.severity] ?? item.severity}`
              : null,
            item.incidence != null ? `Incidência: ${item.incidence}%` : null,
            photoCount > 0 ? `${photoCount} foto${photoCount === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Card mode="elevated" style={styles.card}>
              <Card.Title
                title={threat?.name ?? 'Observação geral'}
                subtitle={
                  [
                    threat
                      ? threat.type === 'disease'
                        ? 'Doença'
                        : 'Praga'
                      : null,
                    fieldName ? `Talhão: ${fieldName}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              {details || item.notes ? (
                <Card.Content style={styles.cardContent}>
                  {details ? <Text variant="bodySmall">{details}</Text> : null}
                  {item.notes ? (
                    <Text variant="bodyMedium" style={styles.muted}>
                      {item.notes}
                    </Text>
                  ) : null}
                </Card.Content>
              ) : null}
            </Card>
          );
        }}
      />

      {isOpen && (
        <FAB
          icon="plus"
          label="Observação"
          color="#fff"
          style={styles.fab}
          onPress={() =>
            router.push(`/visit/${visitId}/new-observation` as Href)
          }
        />
      )}

      <Portal>
        <Dialog
          visible={closeDialogOpen}
          onDismiss={() => setCloseDialogOpen(false)}
        >
          <Dialog.Title>Encerrar visita</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogText}>
              Após encerrar, não é possível adicionar novas observações.
            </Text>
            <TextInput
              label="Notas finais (opcional)"
              value={closeNotes}
              onChangeText={setCloseNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCloseDialogOpen(false)}>Cancelar</Button>
            <Button loading={closing} onPress={onCloseVisit}>
              Encerrar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  header: { gap: 8, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { marginTop: 8, fontWeight: '700' },
  muted: { color: palette.textMuted },
  card: { borderRadius: 16 },
  cardContent: { gap: 4, paddingBottom: 12 },
  empty: { textAlign: 'center', marginTop: 32, color: palette.textMuted },
  footer: { marginTop: 16, gap: 8 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: palette.green,
  },
  dialogText: { marginBottom: 12, color: palette.textMuted },
});
