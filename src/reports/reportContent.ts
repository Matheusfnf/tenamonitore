import * as Crypto from 'expo-crypto';

/**
 * Conteúdo do relatório técnico: lista ORDENADA de blocos que o consultor
 * compõe livremente. O bloco 'visits' é o marcador de onde os dados das
 * visitas selecionadas entram no documento (pode ser movido ou removido).
 * Serializado em JSON na coluna text `reports.content` (padrão do projeto).
 */
export type ReportBlock =
  | { id: string; type: 'text'; title?: string; body?: string }
  | { id: string; type: 'recommendation'; title?: string; body?: string }
  | { id: string; type: 'image'; uri: string; caption?: string }
  | { id: string; type: 'visits' };

export interface ReportContent {
  version: 1;
  /** Incluir as fotos das observações na seção de visitas. */
  includeObservationPhotos: boolean;
  blocks: ReportBlock[];
}

export function newBlockId(): string {
  return Crypto.randomUUID();
}

export function defaultReportContent(): ReportContent {
  return {
    version: 1,
    includeObservationPhotos: true,
    blocks: [{ id: newBlockId(), type: 'visits' }],
  };
}

export function parseReportContent(raw: string | null): ReportContent {
  if (!raw) return defaultReportContent();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.blocks)) {
      return {
        version: 1,
        includeObservationPhotos: parsed.includeObservationPhotos !== false,
        blocks: parsed.blocks,
      };
    }
  } catch {
    // conteúdo corrompido → recomeça do padrão
  }
  return defaultReportContent();
}

export function serializeReportContent(content: ReportContent): string {
  return JSON.stringify(content);
}

export function parseVisitIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
