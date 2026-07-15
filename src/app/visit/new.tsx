import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { database } from '@/db';
import type { Farm, Visit } from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { formatGeoPoint, getCurrentPosition, type GeoPoint } from '@/lib/location';
import { useSync } from '@/sync/SyncProvider';

const WEATHER_OPTIONS = ['Ensolarado', 'Parcialmente nublado', 'Nublado', 'Chuvoso'];

type GpsStatus = 'searching' | 'ok' | 'unavailable';

export default function NewVisitScreen() {
  const { farmId: farmIdParam } = useLocalSearchParams<{ farmId?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { syncNow } = useSync();
  const insets = useSafeAreaInsets();
  const farms = useCollection<Farm>('farms');

  const [farmId, setFarmId] = useState<string | null>(farmIdParam ?? null);
  const [name, setName] = useState('');
  const [weather, setWeather] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState<GeoPoint | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('searching');
  const [saving, setSaving] = useState(false);

  // Captura o GPS em paralelo ao preenchimento — quando salvar, já tem fix.
  useEffect(() => {
    let cancelled = false;
    getCurrentPosition().then((point) => {
      if (cancelled) return;
      setGps(point);
      setGpsStatus(point ? 'ok' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSave = !!farmId && !!profile && !saving;

  const onStart = async () => {
    if (!canSave || !farmId || !profile) return;
    setSaving(true);
    try {
      // GPS é best-effort: sem sinal, a visita começa mesmo assim.
      const point = gps ?? (await getCurrentPosition());
      let visitId = '';
      await database.write(async () => {
        const visit = await database.get<Visit>('visits').create((v) => {
          v.farmId = farmId;
          v.consultantId = profile.id;
          v.name = name.trim() || null;
          v.visitDate = new Date().toISOString().slice(0, 10);
          v.status = 'open';
          v.weather = weather;
          v.notes = notes.trim() || null;
          v.lat = point?.lat ?? null;
          v.lng = point?.lng ?? null;
        });
        visitId = visit.id;
      });
      void syncNow();
      router.replace(`/visit/${visitId}` as Href);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Nova visita" />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[
          styles.form,
          { paddingBottom: 32 + insets.bottom },
        ]}
      >
        <Text variant="labelLarge">Fazenda *</Text>
        {farms.length === 0 ? (
          <Text style={styles.muted}>
            Nenhuma fazenda disponível (sincronize para carregar).
          </Text>
        ) : (
          <View style={styles.cards}>
            {farms.map((f) => (
              <Card
                key={f.id}
                mode={farmId === f.id ? 'contained' : 'outlined'}
                style={styles.farmCard}
                onPress={() => setFarmId(f.id)}
              >
                <Card.Title
                  title={f.name}
                  subtitle={
                    [f.municipality, f.state].filter(Boolean).join(' - ') ||
                    undefined
                  }
                />
              </Card>
            ))}
          </View>
        )}

        <TextInput
          label="Nome da visita (opcional)"
          placeholder="Ex.: Monitoramento semanal"
          value={name}
          onChangeText={setName}
          mode="outlined"
        />

        <Text variant="labelLarge" style={styles.label}>
          Clima
        </Text>
        <View style={styles.chips}>
          {WEATHER_OPTIONS.map((w) => (
            <Chip
              key={w}
              selected={weather === w}
              showSelectedCheck
              onPress={() => setWeather(weather === w ? null : w)}
            >
              {w}
            </Chip>
          ))}
        </View>

        <TextInput
          label="Observações gerais"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
        />

        <Chip
          icon={
            gpsStatus === 'ok'
              ? 'crosshairs-gps'
              : gpsStatus === 'searching'
                ? 'crosshairs-question'
                : 'crosshairs-off'
          }
          style={styles.gpsChip}
        >
          {gpsStatus === 'ok' && gps
            ? `GPS: ${formatGeoPoint(gps)}`
            : gpsStatus === 'searching'
              ? 'Buscando sinal de GPS…'
              : 'GPS indisponível (a visita será registrada sem posição)'}
        </Chip>

        <Button
          mode="contained"
          onPress={onStart}
          loading={saving}
          disabled={!canSave}
          style={styles.button}
        >
          Iniciar visita
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { padding: 16, gap: 12 },
  label: { marginTop: 4 },
  cards: { gap: 8 },
  farmCard: { borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gpsChip: { alignSelf: 'flex-start' },
  muted: { opacity: 0.6 },
  button: { marginTop: 8, paddingVertical: 4 },
});
