import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  Portal,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { database } from '@/db';
import type {
  Farm,
  Field,
  Observation,
  ObservationPhoto,
  Report,
  Threat,
  Visit,
} from '@/db/models';
import { useChildren, useCollection } from '@/db/useCollection';
import { formatVisitDate } from '@/lib/dates';
import { deleteLocalPhoto, persistPhoto } from '@/lib/photos';
import { palette } from '@/lib/theme';
import {
  shareTechReport,
  type ReportVisitData,
} from '@/reports/reportBuilder';
import {
  newBlockId,
  parseReportContent,
  parseVisitIds,
  serializeReportContent,
  type ReportBlock,
  type ReportContent,
} from '@/reports/reportContent';
import { useSync } from '@/sync/SyncProvider';

const BLOCK_META: Record<
  ReportBlock['type'],
  { icon: string; label: string }
> = {
  visits: { icon: 'clipboard-text-outline', label: 'Dados das visitas' },
  text: { icon: 'text', label: 'Texto' },
  recommendation: { icon: 'lightbulb-on-outline', label: 'Recomendação técnica' },
  image: { icon: 'image-outline', label: 'Imagem' },
};

export default function ReportBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { syncNow } = useSync();
  const insets = useSafeAreaInsets();
  const reportId = id ?? '';

  const report = useChildren<Report>('reports', 'id', reportId)[0];
  const visits = useCollection<Visit>('visits');
  const farms = useCollection<Farm>('farms');
  const fields = useCollection<Field>('fields');
  const threats = useCollection<Threat>('threats');
  const observations = useCollection<Observation>('observations');
  const photos = useCollection<ObservationPhoto>('observation_photos');

  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const threatById = useMemo(() => new Map(threats.map((t) => [t.id, t])), [threats]);

  // Estado derivado do registro (o registro é a fonte da verdade; cada
  // mutação persiste imediatamente — offline-first, nada se perde).
  const content = useMemo(
    () => parseReportContent(report?.content ?? null),
    [report?.content],
  );
  const selectedVisitIds = useMemo(
    () => parseVisitIds(report?.visitIds ?? null),
    [report?.visitIds],
  );

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  // editor de bloco (texto/recomendação/imagem)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockTitle, setBlockTitle] = useState('');
  const [blockBody, setBlockBody] = useState('');
  const editingBlock = content.blocks.find((b) => b.id === editingBlockId);

  const persist = async (updates: {
    title?: string;
    content?: ReportContent;
    visitIds?: string[];
    generatedAt?: string;
    summary?: string;
  }) => {
    if (!report) return;
    try {
      await database.write(async () => {
        await report.update((r) => {
          if (updates.title !== undefined) r.title = updates.title || null;
          if (updates.content !== undefined) {
            r.content = serializeReportContent(updates.content);
          }
          if (updates.visitIds !== undefined) {
            r.visitIds = JSON.stringify(updates.visitIds);
          }
          if (updates.generatedAt !== undefined) {
            r.generatedAt = updates.generatedAt;
          }
          if (updates.summary !== undefined) r.summary = updates.summary;
        });
      });
    } catch (e) {
      Alert.alert('Relatório', `Não foi possível salvar: ${String(e)}`);
    }
  };

  const setBlocks = (blocks: ReportBlock[]) =>
    persist({ content: { ...content, blocks } });

  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= content.blocks.length) return;
    const blocks = [...content.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    void setBlocks(blocks);
  };

  const removeBlock = (block: ReportBlock) => {
    if (block.type === 'image') deleteLocalPhoto(block.uri);
    void setBlocks(content.blocks.filter((b) => b.id !== block.id));
  };

  const addBlock = (type: 'text' | 'recommendation') => {
    const block: ReportBlock = { id: newBlockId(), type };
    void setBlocks([...content.blocks, block]);
    setBlockTitle('');
    setBlockBody('');
    setEditingBlockId(block.id);
  };

  const addVisitsBlock = () =>
    void setBlocks([...content.blocks, { id: newBlockId(), type: 'visits' }]);

  const addImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = await persistPhoto(result.assets[0].uri);
    const block: ReportBlock = { id: newBlockId(), type: 'image', uri };
    void setBlocks([...content.blocks, block]);
  };

  const openBlockEditor = (block: ReportBlock) => {
    if (block.type === 'visits') return;
    setBlockTitle(
      block.type === 'image' ? (block.caption ?? '') : (block.title ?? ''),
    );
    setBlockBody(block.type === 'image' ? '' : (block.body ?? ''));
    setEditingBlockId(block.id);
  };

  const saveBlockEditor = () => {
    if (!editingBlock) return;
    const blocks = content.blocks.map((b) => {
      if (b.id !== editingBlock.id) return b;
      if (b.type === 'image') {
        return { ...b, caption: blockTitle.trim() || undefined };
      }
      if (b.type === 'text' || b.type === 'recommendation') {
        return {
          ...b,
          title: blockTitle.trim() || undefined,
          body: blockBody.trim() || undefined,
        };
      }
      return b;
    });
    void setBlocks(blocks);
    setEditingBlockId(null);
  };

  const toggleVisit = (visitId: string) => {
    const next = selectedVisitIds.includes(visitId)
      ? selectedVisitIds.filter((v) => v !== visitId)
      : [...selectedVisitIds, visitId];
    void persist({ visitIds: next });
  };

  const sortedVisits = useMemo(
    () =>
      [...visits].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [visits],
  );
  const selectedVisits = useMemo(
    () =>
      sortedVisits
        .filter((v) => selectedVisitIds.includes(v.id))
        .sort((a, b) => a.visitDate.localeCompare(b.visitDate)),
    [sortedVisits, selectedVisitIds],
  );

  const visitLabel = (v: Visit) =>
    `${v.name?.trim() || (farmById.get(v.farmId)?.name ?? 'Fazenda')} · ${formatVisitDate(v.visitDate)}`;

  // ---- geração do PDF -------------------------------------------------------
  const onShare = async () => {
    if (!report || sharing) return;
    setSharing(true);
    try {
      const title =
        (titleDraft ?? report.title)?.trim() || 'Relatório técnico';
      const photosByObs = new Map<string, string[]>();
      for (const p of photos) {
        if (!p.localUri) continue;
        const list = photosByObs.get(p.observationId) ?? [];
        list.push(p.localUri);
        photosByObs.set(p.observationId, list);
      }

      const visitData: ReportVisitData[] = selectedVisits.map((v) => ({
        label: v.name?.trim() || `Visita — ${farmById.get(v.farmId)?.name ?? 'Fazenda'}`,
        farmName: farmById.get(v.farmId)?.name ?? 'Fazenda',
        date: formatVisitDate(v.visitDate),
        weather: v.weather,
        notes: v.notes,
        observations: observations
          .filter((o) => o.visitId === v.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((o) => {
            const threat = o.threatId ? threatById.get(o.threatId) : null;
            return {
              threatName: threat?.name ?? null,
              threatType: threat?.type ?? null,
              fieldName: o.fieldId
                ? (fieldById.get(o.fieldId)?.name ?? null)
                : null,
              severity: o.severity,
              incidence: o.incidence,
              notes: o.notes,
              time: o.createdAt.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              photoUris: photosByObs.get(o.id) ?? [],
            };
          }),
      }));

      const visitFarms = [
        ...new Set(
          selectedVisits
            .map((v) => farmById.get(v.farmId))
            .filter((f): f is Farm => !!f),
        ),
      ];
      const dates = selectedVisits.map((v) => v.visitDate).sort();
      const period =
        dates.length > 0
          ? dates[0] === dates[dates.length - 1]
            ? formatVisitDate(dates[0])
            : `${formatVisitDate(dates[0])} a ${formatVisitDate(dates[dates.length - 1])}`
          : null;

      await shareTechReport({
        title,
        consultantName: profile?.fullName ?? null,
        farmNames: visitFarms.map((f) => f.name),
        ownerNames: [
          ...new Set(
            visitFarms.map((f) => f.ownerName).filter(Boolean) as string[],
          ),
        ],
        period,
        includePhotos: content.includeObservationPhotos,
        blocks: content.blocks,
        visits: visitData,
      });

      await persist({
        title,
        generatedAt: new Date().toISOString(),
        summary: `${selectedVisits.length} visita${selectedVisits.length === 1 ? '' : 's'} · ${visitData.reduce((n, v) => n + v.observations.length, 0)} observações`,
      });
      void syncNow();
    } catch (e) {
      Alert.alert('Relatório', `Não foi possível gerar o PDF: ${String(e)}`);
    } finally {
      setSharing(false);
    }
  };

  const blockPreview = (block: ReportBlock): string => {
    if (block.type === 'visits') {
      return selectedVisits.length > 0
        ? `${selectedVisits.length} visita${selectedVisits.length === 1 ? '' : 's'} selecionada${selectedVisits.length === 1 ? '' : 's'}`
        : 'Nenhuma visita selecionada ainda';
    }
    if (block.type === 'image') return block.caption || 'Sem legenda';
    return block.title || block.body || 'Toque para escrever';
  };

  return (
    <View style={styles.root}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Relatório técnico" />
        <Appbar.Action
          icon="file-pdf-box"
          disabled={sharing}
          onPress={() => void onShare()}
        />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: 32 + insets.bottom },
        ]}
      >
        <TextInput
          label="Título do relatório"
          value={titleDraft ?? report?.title ?? ''}
          onChangeText={setTitleDraft}
          onEndEditing={() => {
            if (titleDraft !== null) void persist({ title: titleDraft.trim() });
          }}
          mode="outlined"
        />

        {/* ---- visitas ---- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Visitas incluídas ({selectedVisits.length})
            </Text>
            <Button
              compact
              mode="text"
              icon="plus"
              onPress={() => setVisitPickerOpen(true)}
            >
              Selecionar
            </Button>
          </View>
          {selectedVisits.length === 0 ? (
            <Text variant="bodySmall" style={styles.muted}>
              Sem visitas — o relatório pode ser 100% manual, ou toque em
              “Selecionar” para reunir uma ou mais visitas (semana, mês, safra…).
            </Text>
          ) : (
            <View style={styles.chips}>
              {selectedVisits.map((v) => (
                <Chip
                  key={v.id}
                  compact
                  icon="clipboard-check-outline"
                  onClose={() => toggleVisit(v.id)}
                >
                  {visitLabel(v)}
                </Chip>
              ))}
            </View>
          )}
          <View style={styles.switchRow}>
            <Text variant="bodyMedium">Incluir fotos das observações</Text>
            <Switch
              value={content.includeObservationPhotos}
              onValueChange={(value) =>
                void persist({
                  content: { ...content, includeObservationPhotos: value },
                })
              }
            />
          </View>
        </View>

        {/* ---- blocos ---- */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Estrutura do documento
          </Text>
          <Text variant="bodySmall" style={styles.muted}>
            Monte o relatório na ordem que quiser — as setas movem cada seção.
          </Text>

          {content.blocks.map((block, index) => {
            const meta = BLOCK_META[block.type];
            return (
              <TouchableRipple
                key={block.id}
                style={styles.blockCard}
                borderless
                onPress={() => openBlockEditor(block)}
              >
                <View style={styles.blockRow}>
                  <MaterialCommunityIcons
                    name={meta.icon as any}
                    size={22}
                    color={
                      block.type === 'recommendation'
                        ? palette.amber
                        : palette.green
                    }
                  />
                  {block.type === 'image' ? (
                    <Image
                      source={{ uri: block.uri }}
                      style={styles.blockThumb}
                      contentFit="cover"
                    />
                  ) : null}
                  <View style={styles.blockTexts}>
                    <Text variant="titleSmall" style={styles.blockTitle}>
                      {meta.label}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={styles.muted}
                      numberOfLines={2}
                    >
                      {blockPreview(block)}
                    </Text>
                  </View>
                  <View style={styles.blockActions}>
                    <IconButton
                      icon="chevron-up"
                      size={18}
                      style={styles.blockActionBtn}
                      disabled={index === 0}
                      onPress={() => moveBlock(index, -1)}
                    />
                    <IconButton
                      icon="chevron-down"
                      size={18}
                      style={styles.blockActionBtn}
                      disabled={index === content.blocks.length - 1}
                      onPress={() => moveBlock(index, 1)}
                    />
                    <IconButton
                      icon="close"
                      size={18}
                      style={styles.blockActionBtn}
                      iconColor={palette.red}
                      onPress={() => removeBlock(block)}
                    />
                  </View>
                </View>
              </TouchableRipple>
            );
          })}

          <View style={styles.addRow}>
            <Button compact mode="outlined" icon="text" onPress={() => addBlock('text')}>
              Texto
            </Button>
            <Button
              compact
              mode="outlined"
              icon="lightbulb-on-outline"
              onPress={() => addBlock('recommendation')}
            >
              Recomendação
            </Button>
            <Button compact mode="outlined" icon="image-outline" onPress={() => void addImage()}>
              Imagem
            </Button>
          </View>
          {!content.blocks.some((b) => b.type === 'visits') ? (
            <Button
              compact
              mode="text"
              icon="clipboard-text-outline"
              onPress={addVisitsBlock}
            >
              Reinserir seção de dados das visitas
            </Button>
          ) : null}
        </View>

        <Button
          mode="contained"
          icon="file-pdf-box"
          loading={sharing}
          disabled={sharing || !report}
          style={styles.shareButton}
          onPress={() => void onShare()}
        >
          Gerar e compartilhar PDF
        </Button>
      </ScrollView>

      {/* ---- seletor de visitas ---- */}
      <Portal>
        <Dialog
          visible={visitPickerOpen}
          onDismiss={() => setVisitPickerOpen(false)}
        >
          <Dialog.Title>Selecionar visitas</Dialog.Title>
          <Dialog.ScrollArea style={styles.pickerArea}>
            <ScrollView>
              {sortedVisits.length === 0 ? (
                <Text variant="bodySmall" style={styles.pickerEmpty}>
                  Nenhuma visita registrada ainda.
                </Text>
              ) : (
                sortedVisits.map((v) => (
                  <Checkbox.Item
                    key={v.id}
                    label={visitLabel(v)}
                    labelVariant="bodyMedium"
                    status={
                      selectedVisitIds.includes(v.id) ? 'checked' : 'unchecked'
                    }
                    onPress={() => toggleVisit(v.id)}
                  />
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setVisitPickerOpen(false)}>Concluir</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ---- editor de bloco ---- */}
      <Portal>
        <Dialog
          visible={!!editingBlock}
          onDismiss={() => setEditingBlockId(null)}
        >
          <Dialog.Title>
            {editingBlock ? BLOCK_META[editingBlock.type].label : ''}
          </Dialog.Title>
          <Dialog.Content style={styles.editorContent}>
            <TextInput
              label={editingBlock?.type === 'image' ? 'Legenda' : 'Título (opcional)'}
              value={blockTitle}
              onChangeText={setBlockTitle}
              mode="outlined"
            />
            {editingBlock?.type !== 'image' ? (
              <TextInput
                label={
                  editingBlock?.type === 'recommendation'
                    ? 'Recomendação'
                    : 'Texto'
                }
                value={blockBody}
                onChangeText={setBlockBody}
                mode="outlined"
                multiline
                numberOfLines={6}
              />
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditingBlockId(null)}>Cancelar</Button>
            <Button onPress={saveBlockEditor}>Salvar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  body: { padding: 16, gap: 16 },
  section: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontWeight: '700' },
  muted: { color: palette.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  blockCard: {
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: 12,
    padding: 10,
    backgroundColor: palette.background,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockThumb: { width: 40, height: 40, borderRadius: 8 },
  blockTexts: { flex: 1 },
  blockTitle: { fontWeight: '700' },
  blockActions: { flexDirection: 'row' },
  blockActionBtn: { margin: 0 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareButton: { paddingVertical: 4 },
  pickerArea: { maxHeight: 360, paddingHorizontal: 0 },
  pickerEmpty: { padding: 16, color: palette.textMuted },
  editorContent: { gap: 10 },
});
