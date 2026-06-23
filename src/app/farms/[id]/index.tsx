import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, Text } from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import type { Farm, Field } from '@/db/models';
import { useChildren } from '@/db/useCollection';

export default function FarmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const farmId = id ?? '';
  const farm = useChildren<Farm>('farms', 'id', farmId)[0];
  const fields = useChildren<Field>('fields', 'farm_id', farmId);

  const location = farm
    ? [farm.municipality, farm.state].filter(Boolean).join(' - ')
    : '';

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={farm?.name ?? 'Fazenda'} subtitle="Talhões" />
      </Appbar.Header>

      <FlatList
        data={fields}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          farm ? (
            <View style={styles.header}>
              {farm.ownerName ? (
                <Text variant="bodyMedium">Produtor: {farm.ownerName}</Text>
              ) : null}
              {location ? (
                <Text variant="bodyMedium" style={styles.muted}>
                  {location}
                </Text>
              ) : null}
              <Text variant="titleSmall" style={styles.sectionTitle}>
                Talhões ({fields.length})
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhum talhão cadastrado.</Text>
        }
        renderItem={({ item }) => (
          <Card mode="contained" style={styles.card}>
            <Card.Title
              title={item.name}
              subtitle={
                [
                  item.areaHa != null ? `${item.areaHa} ha` : null,
                  item.season,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
            />
          </Card>
        )}
      />

      {isAdmin && (
        <FAB
          icon="plus"
          label="Talhão"
          style={styles.fab}
          onPress={() => router.push(`/farms/${farmId}/new-field` as Href)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 12 },
  header: { gap: 4, marginBottom: 4 },
  sectionTitle: { marginTop: 12 },
  muted: { opacity: 0.7 },
  card: { borderRadius: 12 },
  empty: { textAlign: 'center', marginTop: 32, opacity: 0.6 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
