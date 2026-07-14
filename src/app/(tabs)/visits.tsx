import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { FAB, Text, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '@/components/IconBadge';
import type { Farm, Observation, Visit } from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { formatVisitDate } from '@/lib/dates';
import { palette } from '@/lib/theme';

export default function VisitsScreen() {
  const router = useRouter();
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
              name="clipboard-text-outline"
              size={44}
              color={palette.textMuted}
            />
            <Text style={styles.empty}>
              Nenhuma visita ainda.{'\n'}Toque em “Nova visita” para começar.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const farm = farmById.get(item.farmId);
          const count = obsCountByVisit.get(item.id) ?? 0;
          const open = item.status === 'open';
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
                    {farm?.name ?? 'Fazenda'}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
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
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={palette.textMuted}
                />
              </View>
            </TouchableRipple>
          );
        }}
      />

      <FAB
        icon="plus"
        label="Nova visita"
        style={styles.fab}
        color="#fff"
        onPress={() => router.push('/visit/new' as Href)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 2 },
  title: { fontWeight: '800' },
  muted: { color: palette.textMuted },
  list: { padding: 20, gap: 12, paddingBottom: 96 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { fontWeight: '700' },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  emptyBox: { alignItems: 'center', marginTop: 48, gap: 12 },
  empty: { textAlign: 'center', color: palette.textMuted },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: palette.green,
  },
});
