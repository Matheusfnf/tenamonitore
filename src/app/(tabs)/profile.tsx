import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { palette } from '@/lib/theme';
import { useSync } from '@/sync/SyncProvider';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? ''))
    .toUpperCase();
}

export default function ProfileScreen() {
  const { profile, session, isAdmin, signOut } = useAuth();
  const { status, lastSyncedAt, syncNow } = useSync();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineSmall" style={styles.title}>
          Perfil
        </Text>

        <View style={styles.card}>
          <View style={styles.identityRow}>
            <Avatar.Text
              size={56}
              label={initials(profile?.fullName)}
              style={{ backgroundColor: palette.greenSoft }}
              color={palette.greenDark}
            />
            <View style={styles.identityTexts}>
              <Text variant="titleMedium" style={styles.name}>
                {profile?.fullName ?? 'Usuário'}
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                {session?.user.email}
              </Text>
              <View style={styles.rolePill}>
                <Text variant="labelSmall" style={styles.roleText}>
                  {isAdmin ? 'Administrador' : 'Consultor'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Sincronização
          </Text>
          <Text variant="bodySmall" style={styles.muted}>
            {status === 'syncing'
              ? 'Sincronizando…'
              : status === 'error'
                ? 'Última tentativa falhou — os dados continuam salvos no aparelho.'
                : status === 'offline'
                  ? 'Sem internet — os dados ficam salvos no aparelho.'
                  : 'Tudo sincronizado.'}
          </Text>
          {lastSyncedAt ? (
            <Text variant="bodySmall" style={styles.muted}>
              Última sincronização:{' '}
              {new Date(lastSyncedAt).toLocaleString('pt-BR')}
            </Text>
          ) : null}
          <Divider style={styles.divider} />
          <Button
            mode="outlined"
            icon="sync"
            onPress={() => void syncNow()}
            disabled={status === 'syncing'}
          >
            Sincronizar agora
          </Button>
        </View>

        <Button
          mode="outlined"
          icon="logout"
          textColor={palette.red}
          style={styles.signOut}
          onPress={() => void signOut()}
        >
          Sair da conta
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '800', marginBottom: 4 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 16,
    gap: 6,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityTexts: { flex: 1, gap: 2 },
  name: { fontWeight: '700' },
  muted: { color: palette.textMuted },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.greenSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  roleText: { color: palette.greenDark, fontWeight: '700' },
  sectionTitle: { fontWeight: '700' },
  divider: { marginVertical: 8 },
  signOut: { borderColor: palette.red, marginTop: 8 },
});
