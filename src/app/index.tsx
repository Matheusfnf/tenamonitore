import { useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Chip, IconButton, Text } from 'react-native-paper';

import { useAuth } from '@/auth/AuthProvider';
import { useSync, type SyncStatus } from '@/sync/SyncProvider';

const SYNC_META: Record<SyncStatus, { label: string; icon: string }> = {
  idle: { label: 'Sincronizado', icon: 'check-circle' },
  syncing: { label: 'Sincronizando…', icon: 'sync' },
  error: { label: 'Erro ao sincronizar', icon: 'alert-circle' },
  offline: { label: 'Offline', icon: 'cloud-off-outline' },
};

type DashCard = { title: string; desc: string; route?: Href };

const ADMIN_CARDS: DashCard[] = [
  { title: 'Fazendas', desc: 'Cadastrar fazendas e desenhar talhões no mapa.', route: '/farms' },
  { title: 'Catálogos', desc: 'Culturas e catálogo de pragas/doenças.' },
  { title: 'Consultores', desc: 'Atribuir consultores às fazendas.' },
  { title: 'Relatórios', desc: 'Acompanhar relatórios das visitas.' },
];

const CONSULTANT_CARDS: DashCard[] = [
  { title: 'Minhas fazendas', desc: 'Fazendas atribuídas, disponíveis offline.', route: '/farms' },
  { title: 'Nova visita', desc: 'Iniciar visita técnica e registrar observações.' },
  { title: 'Mapa', desc: 'Ver talhões e sua localização no campo.' },
  { title: 'Relatório diário', desc: 'Gerar e compartilhar o PDF da visita.' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isAdmin, signOut } = useAuth();
  const { status, lastSyncedAt, syncNow } = useSync();
  const meta = SYNC_META[status];
  const cards = isAdmin ? ADMIN_CARDS : CONSULTANT_CARDS;

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.Content
          title="TenaMonitore"
          subtitle={isAdmin ? 'Administrador' : 'Consultor'}
        />
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleMedium">
          Olá{profile?.fullName ? `, ${profile.fullName}` : ''} 👋
        </Text>

        <View style={styles.syncRow}>
          <Chip icon={meta.icon}>{meta.label}</Chip>
          <Button
            mode="text"
            onPress={() => void syncNow()}
            disabled={status === 'syncing'}
          >
            Sincronizar
          </Button>
        </View>
        {lastSyncedAt ? (
          <Text variant="bodySmall" style={styles.muted}>
            Última sincronização: {new Date(lastSyncedAt).toLocaleString('pt-BR')}
          </Text>
        ) : null}

        <View style={styles.cards}>
          {cards.map((c) => (
            <Card
              key={c.title}
              mode="contained"
              style={styles.card}
              onPress={c.route ? () => router.push(c.route as Href) : undefined}
            >
              <Card.Title
                title={c.title}
                right={
                  c.route
                    ? (props) => <IconButton {...props} icon="chevron-right" />
                    : undefined
                }
              />
              <Card.Content>
                <Text variant="bodyMedium" style={styles.muted}>
                  {c.desc}
                </Text>
                {!c.route ? (
                  <Text variant="labelSmall" style={styles.soon}>
                    Em breve
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muted: { opacity: 0.7 },
  soon: { marginTop: 8, opacity: 0.5 },
  cards: { gap: 12, marginTop: 8 },
  card: { borderRadius: 12 },
});
