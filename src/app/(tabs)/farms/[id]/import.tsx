import { Camera, Map as MapLibreMap } from '@maplibre/maplibre-react-native';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { FeatureCollection } from 'geojson';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Button, Checkbox, Text } from 'react-native-paper';

import { FieldPolygons } from '@/components/FieldPolygons';
import { database } from '@/db';
import type { Farm, Field } from '@/db/models';
import { useChildren } from '@/db/useCollection';
import { boundsWithMargin, centerOf } from '@/lib/boundaries';
import { parseGeoFile, type ImportedField } from '@/lib/geoImport';
import { satelliteStyle } from '@/lib/mapStyle';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

export default function ImportFieldsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { syncNow } = useSync();
  const farmId = id ?? '';

  const farm = useChildren<Farm>('farms', 'id', farmId)[0];

  const [fileName, setFileName] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedField[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const pickFile = async () => {
    const res = await File.pickFileAsync();
    if (res.canceled || !res.result) return;
    try {
      const fields = await parseGeoFile(res.result);
      setFileName(res.result.name);
      setImported(fields);
      setSelected(new Set(fields.map((_, i) => i)));
    } catch (e) {
      Alert.alert('Importação', e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedCollection = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: imported
        .filter((_, i) => selected.has(i))
        .map((f) => f.feature),
    }),
    [imported, selected],
  );
  const previewBounds = useMemo(
    () => boundsWithMargin(selectedCollection, 0.3),
    [selectedCollection],
  );

  const onImport = async () => {
    const toImport = imported.filter((_, i) => selected.has(i));
    if (toImport.length === 0 || !farm || importing) return;
    setImporting(true);
    try {
      await database.write(async () => {
        for (const item of toImport) {
          await database.get<Field>('fields').create((f) => {
            f.farmId = farmId;
            f.name = item.name;
            f.areaHa = item.areaHa;
            f.boundary = JSON.stringify(item.feature);
            f.cropId = null;
            f.season = null;
          });
        }
        if (farm.centerLat == null || farm.centerLng == null) {
          const [lng, lat] = centerOf(toImport[0].feature);
          await farm.update((fa) => {
            fa.centerLat = lat;
            fa.centerLng = lng;
          });
        }
      });
      void syncNow();
      Alert.alert(
        'Importação',
        `${toImport.length} talh${toImport.length === 1 ? 'ão importado' : 'ões importados'} com sucesso.`,
      );
      router.back();
    } catch (e) {
      Alert.alert('Importação', `Falhou: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const totalHa = imported
    .filter((_, i) => selected.has(i))
    .reduce((sum, f) => sum + f.areaHa, 0);

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title="Importar talhões"
          subtitle={farm?.name ?? ''}
        />
      </Appbar.Header>

      {imported.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            Traga os talhões prontos
          </Text>
          <Text variant="bodyMedium" style={styles.emptyText}>
            Selecione um arquivo KML, KMZ ou GeoJSON (exportado do Google
            Earth, OneSoil, QGIS etc.) e os polígonos viram talhões
            automaticamente, com a área calculada.
          </Text>
          <Button mode="contained" icon="file-upload-outline" onPress={pickFile}>
            Escolher arquivo
          </Button>
        </View>
      ) : (
        <>
          <View style={styles.mapBox} key={fileName}>
            <MapLibreMap
              style={styles.map}
              mapStyle={satelliteStyle}
              attributionPosition={{ bottom: 4, left: 4 }}
            >
              {previewBounds ? (
                <Camera initialViewState={{ bounds: previewBounds }} />
              ) : null}
              <FieldPolygons features={selectedCollection} id="preview" />
            </MapLibreMap>
          </View>

          <FlatList
            data={imported}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <View style={styles.row}>
                <Checkbox
                  status={selected.has(index) ? 'checked' : 'unchecked'}
                  onPress={() => toggle(index)}
                />
                <View style={styles.rowTexts}>
                  <Text variant="bodyLarge">{item.name}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {item.areaHa} ha
                  </Text>
                </View>
              </View>
            )}
          />

          <View style={[styles.footer, { paddingBottom: 12 }]}>
            <Text variant="bodySmall" style={styles.muted}>
              {selected.size} de {imported.length} selecionados ·{' '}
              {Math.round(totalHa * 100) / 100} ha
            </Text>
            <View style={styles.footerButtons}>
              <Button mode="outlined" icon="file-swap-outline" onPress={pickFile}>
                Outro arquivo
              </Button>
              <Button
                mode="contained"
                icon="check"
                loading={importing}
                disabled={selected.size === 0 || importing}
                onPress={onImport}
              >
                Importar ({selected.size})
              </Button>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  emptyBox: { flex: 1, justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontWeight: '700', textAlign: 'center' },
  emptyText: { textAlign: 'center', color: palette.textMuted, marginBottom: 8 },
  mapBox: { height: 220 },
  map: { flex: 1 },
  list: { padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  rowTexts: { flex: 1 },
  muted: { color: palette.textMuted },
  footer: {
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.outline,
    backgroundColor: palette.surface,
  },
  footerButtons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
