import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, TextInput } from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import { database } from '@/db';
import type { Farm } from '@/db/models';
import { useSync } from '@/sync/SyncProvider';

export default function NewFarmScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { syncNow } = useSync();

  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [saving, setSaving] = useState(false);

  const orgId = profile?.organizationId ?? null;
  const canSave = name.trim().length > 0 && !!orgId && !saving;

  const onSave = async () => {
    if (!canSave || !orgId) return;
    setSaving(true);
    try {
      await database.write(async () => {
        await database.get<Farm>('farms').create((f) => {
          f.organizationId = orgId;
          f.name = name.trim();
          f.ownerName = ownerName.trim() || null;
          f.municipality = municipality.trim() || null;
          f.state = stateUf.trim() || null;
        });
      });
      void syncNow(); // empurra a nova fazenda assim que houver conexão
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Nova fazenda" />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[
          styles.form,
          { paddingBottom: 32 },
        ]}
      >
        <TextInput
          label="Nome da fazenda *"
          value={name}
          onChangeText={setName}
          mode="outlined"
        />
        <TextInput
          label="Produtor / proprietário"
          value={ownerName}
          onChangeText={setOwnerName}
          mode="outlined"
        />
        <TextInput
          label="Município"
          value={municipality}
          onChangeText={setMunicipality}
          mode="outlined"
        />
        <TextInput
          label="UF"
          value={stateUf}
          onChangeText={setStateUf}
          autoCapitalize="characters"
          maxLength={2}
          mode="outlined"
        />

        {!orgId && (
          <HelperText type="error" visible>
            Seu usuário não tem organização definida. Configure
            organization_id no metadata do Supabase.
          </HelperText>
        )}

        <Button
          mode="contained"
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
          style={styles.button}
        >
          Salvar
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { padding: 16, gap: 12 },
  button: { marginTop: 8, paddingVertical: 4 },
});
