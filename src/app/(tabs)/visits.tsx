import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  Dialog,
  IconButton,
  Portal,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '@/components/IconBadge';
import { database } from '@/db';
import type {
  Farm,
  Observation,
  ObservationPhoto,
  Recommendation,
  Report,
  Visit,
} from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { formatVisitDate } from '@/lib/dates';
import { deleteLocalPhoto } from '@/lib/photos';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

const WEATHER_OPTIONS = ['Ensolarado', 'Parcialmente nublado', 'Nublado', 'Chuvoso'];

export default function VisitsScreen() {
  const router = useRouter();
  const { syncNow } = useSync();
  const visits = useCollection<Visit>('visits');
  const farms = useCollection<Farm>('farms');
  const observations = useCollection<Observation>('observations');

  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const obsCountByVisit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of observations) {
      counts.set(o.visitId, (counts.get(o.visitId) ?? 0) + 1);
    }
    return counts;
  }, [observations]);

  const sorted = useMemo(
    () =>
      [...visits].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }),
    [visits],
  );

  // ---- editar dados da visita (nome/clima/notas — nunca localização) -------
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [editName, setEditName] = useState('');
  const [editWeather, setEditWeather] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (visit: Visit) => {
    setEditName(visit.name ?? '');
    setEditWeather(visit.weather);
    setEditNotes(visit.notes ?? '');
    setEditVisit(visit);
  };

  const onSaveEdit = async () => {
    if (!editVisit || savingEdit) return;
    setSavingEdit(true);
    try {
      await database.write(async () => {
        await editVisit.update((v) => {
          v.name = editName.trim() || null;
          v.weather = editWeather;
          v.notes = editNotes.trim() || null;
        });
      });
      setEditVisit(null);
      void syncNow();
    } catch (e) {
      Alert.alert('Visita', `Não foi possível salvar: ${String(e)}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // ---- excluir visita (em cascata: observações, fotos, relatórios) ---------
  const deleteVisit = async (visit: Visit) => {
    try {
      const obs = await database
        .get<Observation>('observations')
        .query(Q.where('visit_id', visit.id))
        .fetch();
      const obsIds = obs.map((o) => o.id);
      const photos =
        obsIds.length > 0
          ? await database
              .get<ObservationPhoto>('observation_photos')
              .query(Q.where('observation_id', Q.oneOf(obsIds)))
              .fetch()
          : [];
      const reports = await database
        .get<Report>('reports')
        .query(Q.where('visit_id', visit.id))
        .fetch();
      const recommendations = await database
        .get<Recommendation>('recommendations')
        .query(Q.where('visit_id', visit.id))
        .fetch();

      await database.write(async () => {
        for (const p of photos) await p.markAsDeleted();
        for (const o of obs) await o.markAsDeleted();
        for (const r of reports) await r.markAsDeleted();
        for (const r of recommendations) await r.markAsDeleted();
        await visit.markAsDeleted();
      });
      for (const p of photos) {
        if (p.localUri) deleteLocalPhoto(p.localUri);
      }
      void syncNow();
    } catch (e) {
      Alert.alert('Visita', `Não foi possível excluir: ${String(e)}`);
    }
  };

  const confirmDelete = (visit: Visit, label: string) => {
    const count = obsCountByVisit.get(visit.id) ?? 0;
    Alert.alert(
      'Excluir visita',
      `"${label}" e suas ${count} observaç${count === 1 ? 'ão' : 'ões'} (com fotos) serão removidas. Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void deleteVisit(visit),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          Visitas
        </Text>
        <Text variant="bodyMedium" style={styles.muted}>
          Visitas técnicas e observações de campo.
        </Text>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons
              name="map-marker-path"
              size={44}
              color={palette.textMuted}
            />
            <Text style={styles.empty}>
              Nenhuma visita ainda.{'\n'}Inicie uma visita pela aba Mapa.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const farm = farmById.get(item.farmId);
          const count = obsCountByVisit.get(item.id) ?? 0;
          const open = item.status === 'open';
          const label = item.name?.trim() || (farm?.name ?? 'Fazenda');
          return (
            <TouchableRipple
              style={styles.card}
              borderless
              onPress={() => router.push(`/visit/${item.id}` as Href)}
            >
              <View style={styles.cardRow}>
                <IconBadge
                  icon={open ? 'progress-clock' : 'check-circle-outline'}
                  color={open ? palette.amber : palette.greenDark}
                  background={open ? palette.amberSoft : palette.greenSoft}
                />
                <View style={styles.cardTexts}>
                  <Text variant="titleMedium" style={styles.cardTitle}>
                    {label}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {item.name?.trim() ? `${farm?.name ?? 'Fazenda'} · ` : ''}
                    {formatVisitDate(item.visitDate)} · {count} observaç
                    {count === 1 ? 'ão' : 'ões'}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: open
                          ? palette.amberSoft
                          : palette.greenSoft,
                      },
                    ]}
                  >
                    <Text
                      variant="labelSmall"
                      style={{
                        color: open ? palette.amber : palette.greenDark,
                        fontWeight: '700',
                      }}
                    >
                      {open ? 'Em andamento' : 'Encerrada'}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <IconButton
                    icon="pencil-outline"
                    size={20}
                    onPress={() => openEdit(item)}
                  />
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    iconColor={palette.red}
                    onPress={() => confirmDelete(item, label)}
                  />
                </View>
              </View>
            </TouchableRipple>
          );
        }}
      />

      <Portal>
        <Dialog visible={!!editVisit} onDismiss={() => setEditVisit(null)}>
          <Dialog.Title>Editar visita</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              label="Nome da visita"
              value={editName}
              onChangeText={setEditName}
              mode="outlined"
            />
            <Text variant="labelLarge">Clima</Text>
            <View style={styles.chips}>
              {WEATHER_OPTIONS.map((w) => (
                <Chip
                  key={w}
                  compact
                  selected={editWeather === w}
                  showSelectedCheck
                  onPress={() => setEditWeather(editWeather === w ? null : w)}
                >
                  {w}
                </Chip>
              ))}
            </View>
            <TextInput
              label="Observações gerais"
              value={editNotes}
              onChangeText={setEditNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditVisit(null)}>Cancelar</Button>
            <Button loading={savingEdit} onPress={onSaveEdit}>
              Salvar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 2 },
  title: { fontWeight: '800' },
  muted: { color: palette.textMuted },
  list: { padding: 20, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { fontWeight: '700' },
  cardActions: { flexDirection: 'row' },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  emptyBox: { alignItems: 'center', marginTop: 48, gap: 12 },
  empty: { textAlign: 'center', color: palette.textMuted },
  dialogContent: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
