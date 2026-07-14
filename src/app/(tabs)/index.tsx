import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { IconBadge } from '@/components/IconBadge';
import { palette } from '@/lib/theme';
import { useSync, type SyncStatus } from '@/sync/SyncProvider';

const SYNC_META: Record<
  SyncStatus,
  { label: string; icon: string; color: string; background: string }
> = {
  idle: {
    label: 'Sincronizado',
    icon: 'check-circle',
    color: palette.greenDark,
    background: palette.greenSoft,
  },
  syncing: {
    label: 'Sincronizando…',
    icon: 'sync',
    color: palette.blue,
    background: palette.blueSoft,
  },
  error: {
    label: 'Erro ao sincronizar',
    icon: 'alert-circle',
    color: palette.red,
    background: palette.redSoft,
  },
  offline: {
    label: 'Offline',
    icon: 'cloud-off-outline',
    color: palette.amber,
    background: palette.amberSoft,
  },
};

interface DashCard {
  title: string;
  desc: string;
  icon: string;
  color: string;
  background: string;
  route?: Href;
}

const ADMIN_CARDS: DashCard[] = [
  {
    title: 'Fazendas',
    desc: 'Cadastrar fazendas e talhões.',
    icon: 'barn',
    color: palette.greenDark,
    background: palette.greenSoft,
    route: '/farms' as Href,
  },
  {
    title: 'Visitas',
    desc: 'Acompanhar visitas técnicas e observações.',
    icon: 'clipboard-text-outline',
    color: palette.greenDark,
    background: palette.greenSoft,
    route: '/visits' as Href,
  },
  {
    title: 'Catálogos',
    desc: 'Culturas e catálogo de pragas/doenças.',
    icon: 'sprout',
    color: palette.purple,
    background: palette.purpleSoft,
  },
  {
    title: 'Consultores',
    desc: 'Atribuir consultores às fazendas.',
    icon: 'account-group-outline',
    color: palette.purple,
    background: palette.purpleSoft,
  },
];

const CONSULTANT_CARDS: DashCard[] = [
  {
    title: 'Visitas',
    desc: 'Iniciar visita técnica e registrar observações.',
    icon: 'clipboard-text-outline',
    color: palette.greenDark,
    background: palette.greenSoft,
    route: '/visits' as Href,
  },
  {
    title: 'Minhas fazendas',
    desc: 'Fazendas atribuídas, disponíveis offline.',
    icon: 'barn',
    color: palette.greenDark,
    background: palette.greenSoft,
    route: '/farms' as Href,
  },
  {
    title: 'Catálogos',
    desc: 'Culturas e catálogo de pragas/doenças.',
    icon: 'sprout',
    color: palette.purple,
    background: palette.purpleSoft,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isAdmin } = useAuth();
  const { status, lastSyncedAt, syncNow } = useSync();
  const meta = SYNC_META[status];
  const cards = isAdmin ? ADMIN_CARDS : CONSULTANT_CARDS;
  const firstName = profile?.fullName?.split(' ')[0];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <MaterialCommunityIcons name="leaf" size={26} color={palette.green} />
          <Text variant="titleLarge" style={styles.brand}>
            Tena
            <Text variant="titleLarge" style={styles.brandAccent}>
              Monitore
            </Text>
          </Text>
        </View>

        <View style={styles.greeting}>
          <Text variant="headlineSmall" style={styles.hello}>
            Olá{firstName ? `, ${firstName}` : ''} 👋
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            Bem-vindo ao seu painel de monitoramento.
          </Text>
        </View>

        <View style={styles.syncCard}>
          <View style={[styles.syncPill, { backgroundColor: meta.background }]}>
            <MaterialCommunityIcons
              name={meta.icon as any}
              size={16}
              color={meta.color}
            />
            <Text
              variant="labelMedium"
              style={{ color: meta.color, fontWeight: '700' }}
            >
              {meta.label}
            </Text>
          </View>
          <TouchableRipple
            onPress={() => void syncNow()}
            disabled={status === 'syncing'}
            style={styles.syncButton}
            borderless
          >
            <View style={styles.syncButtonInner}>
              <MaterialCommunityIcons
                name="sync"
                size={16}
                color={palette.green}
              />
              <Text
                variant="labelMedium"
                style={{ color: palette.green, fontWeight: '700' }}
              >
                Sincronizar
              </Text>
            </View>
          </TouchableRipple>
        </View>
        {lastSyncedAt ? (
          <Text variant="bodySmall" style={styles.lastSync}>
            Última sincronização:{' '}
            {new Date(lastSyncedAt).toLocaleString('pt-BR')}
          </Text>
        ) : null}

        <View style={styles.cards}>
          {cards.map((c) => (
            <TouchableRipple
              key={c.title}
              onPress={c.route ? () => router.push(c.route!) : undefined}
              style={styles.card}
              borderless
            >
              <View style={styles.cardRow}>
                <IconBadge
                  icon={c.icon}
                  color={c.color}
                  background={c.background}
                />
                <View style={styles.cardTexts}>
                  <Text variant="titleMedium" style={styles.cardTitle}>
                    {c.title}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {c.desc}
                  </Text>
                  {!c.route ? (
                    <View style={styles.soonPill}>
                      <Text variant="labelSmall" style={styles.soonText}>
                        Em breve
                      </Text>
                    </View>
                  ) : null}
                </View>
                {c.route ? (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={palette.textMuted}
                  />
                ) : null}
              </View>
            </TouchableRipple>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { fontWeight: '800', color: palette.text },
  brandAccent: { fontWeight: '800', color: palette.green },
  greeting: { marginTop: 8, gap: 2 },
  hello: { fontWeight: '800' },
  muted: { color: palette.textMuted },
  syncCard: {
    marginTop: 8,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  syncButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  syncButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastSync: { color: palette.textMuted, marginTop: -4 },
  cards: { gap: 12, marginTop: 8 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { fontWeight: '700' },
  soonPill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.purpleSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  soonText: { color: palette.purple, fontWeight: '700' },
});
