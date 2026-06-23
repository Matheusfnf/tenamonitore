import { useRouter, type Href } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, Text } from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import type { Farm } from '@/db/models';
import { useCollection } from '@/db/useCollection';

export default function FarmsListScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const farms = useCollection<Farm>('farms');

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title="Fazendas"
          subtitle={`${farms.length} cadastrada(s)`}
        />
      </Appbar.Header>

      <FlatList
        data={farms}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isAdmin
              ? 'Nenhuma fazenda ainda. Toque em + para cadastrar.'
              : 'Nenhuma fazenda atribuída a você ainda.'}
          </Text>
        }
        renderItem={({ item }) => {
          const location = [item.municipality, item.state]
            .filter(Boolean)
            .join(' - ');
          return (
            <Card
              mode="contained"
              style={styles.card}
              onPress={() => router.push(`/farms/${item.id}` as Href)}
            >
              <Card.Title
                title={item.name}
                subtitle={
                  [item.ownerName, location].filter(Boolean).join(' · ') ||
                  undefined
                }
                right={(props) => (
                  <Text {...props} style={styles.chevron}>
                    ›
                  </Text>
                )}
              />
            </Card>
          );
        }}
      />

      {isAdmin && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/farms/new')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12 },
  chevron: { fontSize: 28, opacity: 0.4, marginRight: 16 },
  empty: { textAlign: 'center', marginTop: 48, opacity: 0.6 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
