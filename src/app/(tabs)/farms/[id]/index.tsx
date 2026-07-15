import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, FAB, ProgressBar, Text } from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import type { Farm, Field } from '@/db/models';
import { useChildren } from '@/db/useCollection';
import {
  boundsAroundPoint,
  boundsWithMargin,
  fieldsToFeatureCollection,
} from '@/lib/boundaries';
import {
  deleteFarmPack,
  downloadFarmPack,
  getFarmPack,
  stopWatchingPack,
} from '@/lib/offlineMap';
import { palette } from '@/lib/theme';

type PackUiState =
  | { kind: 'unknown' }
  | { kind: 'none' }
  | { kind: 'downloading'; percentage: number }
  | { kind: 'complete' };

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

  // ---- mapa offline -------------------------------------------------------
  const [pack, setPack] = useState<PackUiState>({ kind: 'unknown' });
  const watchedPackId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFarmPack(farmId)
      .then(async (existing) => {
        if (cancelled) return;
        if (!existing) {
          setPack({ kind: 'none' });
          return;
        }
        const status = await existing.status();
        if (cancelled) return;
        setPack(
          status.state === 'complete' || status.percentage >= 100
            ? { kind: 'complete' }
            : { kind: 'downloading', percentage: status.percentage },
        );
      })
      .catch(() => setPack({ kind: 'none' }));
    return () => {
      cancelled = true;
      if (watchedPackId.current) stopWatchingPack(watchedPackId.current);
    };
  }, [farmId]);

  const farmBounds = useMemo(() => {
    const withPolygons = boundsWithMargin(fieldsToFeatureCollection(fields), 1);
    if (withPolygons) return withPolygons;
    if (farm?.centerLat != null && farm?.centerLng != null) {
      return boundsAroundPoint(farm.centerLng, farm.centerLat, 3);
    }
    return null;
  }, [fields, farm]);

  const onDownloadMap = async () => {
    if (!farm || !farmBounds) return;
    setPack({ kind: 'downloading', percentage: 0 });
    try {
      const created = await downloadFarmPack(
        farm.id,
        farm.name,
        farmBounds,
        (status: OfflinePackStatus) => {
          if (status.state === 'complete' || status.percentage >= 100) {
            setPack({ kind: 'complete' });
          } else {
            setPack({ kind: 'downloading', percentage: status.percentage });
          }
        },
        (message) => {
          Alert.alert('Mapa offline', `Download falhou: ${message}`);
          setPack({ kind: 'none' });
        },
      );
      watchedPackId.current = created.id;
    } catch (e) {
      Alert.alert('Mapa offline', e instanceof Error ? e.message : String(e));
      setPack({ kind: 'none' });
    }
  };

  const onDeleteMap = async () => {
    await deleteFarmPack(farmId);
    setPack({ kind: 'none' });
  };
  // -------------------------------------------------------------------------

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={farm?.name ?? 'Fazenda'} subtitle="Talhões" />
        {isAdmin && (
          <Appbar.Action
            icon="file-upload-outline"
            onPress={() => router.push(`/farms/${farmId}/import` as Href)}
          />
        )}
      </Appbar.Header>

      <FlatList
        data={fields}
        keyExtractor={(f) => f.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 96 },
        ]}
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

              <Card mode="elevated" style={styles.offlineCard}>
                <Card.Content style={styles.offlineContent}>
                  <View style={styles.offlineRow}>
                    <MaterialCommunityIcons
                      name={
                        pack.kind === 'complete'
                          ? 'cloud-check-outline'
                          : 'cloud-download-outline'
                      }
                      size={22}
                      color={
                        pack.kind === 'complete'
                          ? palette.green
                          : palette.textMuted
                      }
                    />
                    <View style={styles.offlineTexts}>
                      <Text variant="titleSmall" style={styles.offlineTitle}>
                        Mapa offline
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        {pack.kind === 'complete'
                          ? 'Região baixada — o satélite funciona sem internet.'
                          : pack.kind === 'downloading'
                            ? `Baixando… ${Math.round(pack.percentage)}%`
                            : farmBounds
                              ? 'Baixe a região antes de ir a campo.'
                              : 'Desenhe um talhão (ou defina o centro) para habilitar.'}
                      </Text>
                    </View>
                    {pack.kind === 'none' && farmBounds ? (
                      <Button compact mode="contained" onPress={onDownloadMap}>
                        Baixar
                      </Button>
                    ) : null}
                    {pack.kind === 'complete' ? (
                      <Button compact mode="text" onPress={onDeleteMap}>
                        Excluir
                      </Button>
                    ) : null}
                  </View>
                  {pack.kind === 'downloading' ? (
                    <ProgressBar
                      progress={pack.percentage / 100}
                      color={palette.green}
                      style={styles.progress}
                    />
                  ) : null}
                </Card.Content>
              </Card>

              <Text variant="titleSmall" style={styles.sectionTitle}>
                Talhões ({fields.length})
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nenhum talhão cadastrado.
            {isAdmin ? ' Cadastre um ou importe um KML.' : ''}
          </Text>
        }
        renderItem={({ item }) => {
          const hasBoundary = !!item.boundary;
          return (
            <Card
              mode="elevated"
              style={styles.card}
              onPress={
                isAdmin
                  ? () =>
                      router.push(
                        `/farms/${farmId}/draw?fieldId=${item.id}` as Href,
                      )
                  : undefined
              }
            >
              <Card.Title
                title={item.name}
                subtitle={
                  [
                    item.areaHa != null ? `${item.areaHa} ha` : null,
                    item.season,
                    hasBoundary ? 'polígono ok' : isAdmin ? 'sem polígono' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                right={(props) =>
                  isAdmin ? (
                    <MaterialCommunityIcons
                      {...props}
                      name="vector-polygon"
                      size={22}
                      color={hasBoundary ? palette.green : palette.textMuted}
                      style={styles.polygonIcon}
                    />
                  ) : null
                }
              />
            </Card>
          );
        }}
      />

      {isAdmin ? (
        <FAB
          icon="plus"
          label="Talhão"
          color="#fff"
          style={styles.fab}
          onPress={() => router.push(`/farms/${farmId}/new-field` as Href)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  header: { gap: 4, marginBottom: 4 },
  sectionTitle: { marginTop: 12, fontWeight: '700' },
  muted: { color: palette.textMuted },
  offlineCard: { borderRadius: 16, marginTop: 12 },
  offlineContent: { gap: 8 },
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  offlineTexts: { flex: 1 },
  offlineTitle: { fontWeight: '700' },
  progress: { borderRadius: 4 },
  card: { borderRadius: 16 },
  polygonIcon: { marginRight: 16 },
  empty: { textAlign: 'center', marginTop: 32, color: palette.textMuted },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: palette.green,
  },
});
