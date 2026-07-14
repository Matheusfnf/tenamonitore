import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Chip, Text, TextInput } from 'react-native-paper';

import { database } from '@/db';
import type { Crop, Field } from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { useSync } from '@/sync/SyncProvider';

export default function NewFieldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { syncNow } = useSync();
  const crops = useCollection<Crop>('crops');
  const farmId = id ?? '';

  const [name, setName] = useState('');
  const [cropId, setCropId] = useState<string | null>(null);
  const [areaHa, setAreaHa] = useState('');
  const [season, setSeason] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !!farmId && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let fieldId = '';
      await database.write(async () => {
        const field = await database.get<Field>('fields').create((f) => {
          f.farmId = farmId;
          f.cropId = cropId;
          f.name = name.trim();
          const parsed = parseFloat(areaHa.replace(',', '.'));
          f.areaHa = Number.isFinite(parsed) ? parsed : null;
          f.season = season.trim() || null;
          f.boundary = null;
        });
        fieldId = field.id;
      });
      void syncNow();
      // Emenda o desenho do polígono no fluxo (a área é recalculada ao salvar).
      router.replace(`/farms/${farmId}/draw?fieldId=${fieldId}` as Href);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Novo talhão" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.form}>
        <TextInput
          label="Nome do talhão *"
          value={name}
          onChangeText={setName}
          mode="outlined"
        />

        <Text variant="labelLarge" style={styles.label}>
          Cultura
        </Text>
        <View style={styles.chips}>
          {crops.map((c) => (
            <Chip
              key={c.id}
              selected={cropId === c.id}
              showSelectedCheck
              onPress={() => setCropId(cropId === c.id ? null : c.id)}
            >
              {c.name}
            </Chip>
          ))}
          {crops.length === 0 ? (
            <Text style={styles.muted}>
              Nenhuma cultura no catálogo (sincronize para carregar).
            </Text>
          ) : null}
        </View>

        <TextInput
          label="Área (ha)"
          value={areaHa}
          onChangeText={setAreaHa}
          keyboardType="decimal-pad"
          mode="outlined"
        />
        <TextInput
          label="Safra (ex.: 2025/26)"
          value={season}
          onChangeText={setSeason}
          mode="outlined"
        />

        <Button
          mode="contained"
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
          style={styles.button}
        >
          Salvar talhão
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { padding: 16, gap: 12 },
  label: { marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { opacity: 0.6 },
  button: { marginTop: 8, paddingVertical: 4 },
});
