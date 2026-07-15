import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { FAB, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { IconBadge } from '@/components/IconBadge';
import { database } from '@/db';
import type { Farm, Report, Visit } from '@/db/models';
import { useCollection } from '@/db/useCollection';
import { deleteLocalPhoto } from '@/lib/photos';
import { palette } from '@/lib/theme';
import {
  defaultReportContent,
  parseReportContent,
  parseVisitIds,
  serializeReportContent,
} from '@/reports/reportContent';
import { useSync } from '@/sync/SyncProvider';

export default function ReportsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { syncNow } = useSync();
  const reports = useCollection<Report>('reports');
  const visits = useCollection<Visit>('visits');
  const farms = useCollection<Farm>('farms');

  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits]);

  const sorted = useMemo(
    () => [...reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [reports],
  );

  const onCreate = async () => {
    if (!profile) return;
    let reportId = '';
    await database.write(async () => {
      const report = await database.get<Report>('reports').create((r) => {
        r.title = `Relatório — ${new Date().toLocaleDateString('pt-BR')}`;
        r.organizationId = profile.organizationId;
        r.consultantId = profile.id;
        r.visitIds = JSON.stringify([]);
        r.content = serializeReportContent(defaultReportContent());
        r.visitId = null;
        r.farmId = null;
        r.summary = null;
        r.pdfPath = null;
        r.generatedAt = null;
      });
      reportId = report.id;
    });
    router.push(`/report/${reportId}` as Href);
  };

  const deleteReport = async (report: Report) => {
    try {
      // limpa as cópias locais das imagens adicionadas manualmente
      const content = parseReportContent(report.content);
      await database.write(async () => {
        await report.markAsDeleted();
      });
      for (const block of content.blocks) {
        if (block.type === 'image') deleteLocalPhoto(block.uri);
      }
      void syncNow();
    } catch (e) {
      Alert.alert('Relatório', `Não foi possível excluir: ${String(e)}`);
    }
  };

  const confirmDelete = (report: Report) => {
    Alert.alert(
      'Excluir relatório',
      `"${report.title ?? 'Relatório'}" será removido. Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void deleteReport(report),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          Relatórios
        </Text>
        <Text variant="bodyMedium" style={styles.muted}>
          Documentos técnicos para o produtor.
        </Text>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={44}
              color={palette.textMuted}
            />
            <Text style={styles.empty}>
              Nenhum relatório ainda.{'\n'}Monte um a partir das suas visitas —
              ou comece um em branco.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const ids = parseVisitIds(item.visitIds);
          const generated = !!item.generatedAt;
          const farmNames = [
            ...new Set(
              ids
                .map((id) => visitById.get(id))
                .filter((v): v is Visit => !!v)
                .map((v) => farmById.get(v.farmId)?.name)
                .filter(Boolean) as string[],
            ),
          ];
          return (
            <TouchableRipple
              style={styles.card}
              borderless
              onPress={() => router.push(`/report/${item.id}` as Href)}
            >
              <View style={styles.cardRow}>
                <IconBadge
                  icon={generated ? 'file-check-outline' : 'file-edit-outline'}
                  color={generated ? palette.greenDark : palette.amber}
                  background={generated ? palette.greenSoft : palette.amberSoft}
                />
                <View style={styles.cardTexts}>
                  <Text variant="titleMedium" style={styles.cardTitle}>
                    {item.title?.trim() || item.summary || 'Relatório'}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {[
                      farmNames.length > 0 ? farmNames.join(', ') : null,
                      `${ids.length} visita${ids.length === 1 ? '' : 's'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: generated
                          ? palette.greenSoft
                          : palette.amberSoft,
                      },
                    ]}
                  >
                    <Text
                      variant="labelSmall"
                      style={{
                        color: generated ? palette.greenDark : palette.amber,
                        fontWeight: '700',
                      }}
                    >
                      {generated
                        ? `Gerado em ${new Date(item.generatedAt!).toLocaleDateString('pt-BR')}`
                        : 'Rascunho'}
                    </Text>
                  </View>
                </View>
                <IconButton
                  icon="delete-outline"
                  size={20}
                  iconColor={palette.red}
                  onPress={() => confirmDelete(item)}
                />
              </View>
            </TouchableRipple>
          );
        }}
      />

      <FAB
        icon="plus"
        label="Novo relatório"
        color="#fff"
        style={styles.fab}
        onPress={() => void onCreate()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 2 },
  title: { fontWeight: '800' },
  muted: { color: palette.textMuted },
  list: { padding: 20, gap: 12, paddingBottom: 96 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { fontWeight: '700' },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  emptyBox: { alignItems: 'center', marginTop: 48, gap: 12 },
  empty: { textAlign: 'center', color: palette.textMuted },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: palette.green,
  },
});
