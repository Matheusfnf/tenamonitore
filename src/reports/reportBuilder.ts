import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { SEVERITY_LABELS } from '@/lib/severity';
import type { ReportBlock } from '@/reports/reportContent';

/** Observação de uma visita, já resolvida (nomes, não ids). */
export interface ReportObsData {
  threatName: string | null;
  threatType: string | null; // 'pest' | 'disease'
  fieldName: string | null;
  severity: number | null;
  incidence: number | null;
  notes: string | null;
  time: string;
  photoUris: string[];
}

export interface ReportVisitData {
  label: string;
  farmName: string;
  date: string;
  weather: string | null;
  notes: string | null;
  observations: ReportObsData[];
}

export interface TechReportInput {
  title: string;
  consultantName: string | null;
  farmNames: string[];
  ownerNames: string[];
  period: string | null;
  includePhotos: boolean;
  blocks: ReportBlock[];
  visits: ReportVisitData[];
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

async function toDataUri(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return `data:image/jpeg;base64,${await file.base64()}`;
  } catch {
    return null;
  }
}

function severityBadge(severity: number | null): string {
  if (severity == null) return '';
  const label = `${severity} — ${SEVERITY_LABELS[severity] ?? ''}`;
  const style =
    severity >= 4
      ? 'color:#C62828;background:#FDECEA;'
      : severity === 3
        ? 'color:#B26A00;background:#FFF3E0;'
        : 'color:#1B5E20;background:#E7F3E8;';
  return `<span class="badge" style="${style}">Severidade ${esc(label)}</span>`;
}

function typeTag(threatType: string | null): string {
  if (!threatType) return '';
  return threatType === 'disease'
    ? '<span class="tag tag-disease">Doença</span>'
    : '<span class="tag tag-pest">Praga</span>';
}

function infoCell(label: string, value: string): string {
  return `<td class="info-cell"><div class="info-label">${label}</div><div class="info-value">${esc(value)}</div></td>`;
}

async function renderVisitsSection(
  visits: ReportVisitData[],
  includePhotos: boolean,
): Promise<string> {
  if (visits.length === 0) return '';
  const parts: string[] = ['<h2>Registros das visitas</h2>'];
  for (const visit of visits) {
    const meta = [visit.farmName, visit.date, visit.weather]
      .filter(Boolean)
      .join(' · ');
    parts.push(`
      <div class="visit">
        <div class="visit-header">
          <div class="visit-title">${esc(visit.label)}</div>
          <div class="visit-meta">${esc(meta)}</div>
        </div>
        ${visit.notes ? `<div class="visit-notes">${esc(visit.notes)}</div>` : ''}
    `);
    if (visit.observations.length === 0) {
      parts.push('<div class="muted">Sem observações registradas.</div>');
    }
    for (const [i, obs] of visit.observations.entries()) {
      const photos = includePhotos
        ? (await Promise.all(obs.photoUris.map(toDataUri))).filter(
            (p): p is string => !!p,
          )
        : [];
      const metaBits = [
        obs.fieldName ? `Talhão: ${esc(obs.fieldName)}` : null,
        obs.incidence != null ? `Incidência: ${obs.incidence}%` : null,
        obs.time ? `Hora: ${esc(obs.time)}` : null,
      ]
        .filter(Boolean)
        .join(' &nbsp;·&nbsp; ');
      parts.push(`
        <div class="obs">
          <div class="obs-head">
            <span class="obs-num">${i + 1}</span>
            <span class="obs-name">${esc(obs.threatName ?? 'Observação geral')}</span>
            ${typeTag(obs.threatType)}
            ${severityBadge(obs.severity)}
          </div>
          ${metaBits ? `<div class="obs-meta">${metaBits}</div>` : ''}
          ${obs.notes ? `<div class="obs-notes">${esc(obs.notes)}</div>` : ''}
          ${
            photos.length > 0
              ? `<div class="photos">${photos.map((p) => `<img src="${p}"/>`).join('')}</div>`
              : ''
          }
        </div>`);
    }
    parts.push('</div>');
  }
  return parts.join('');
}

async function renderBlocks(input: TechReportInput): Promise<string> {
  const parts: string[] = [];
  for (const block of input.blocks) {
    if (block.type === 'visits') {
      parts.push(await renderVisitsSection(input.visits, input.includePhotos));
    } else if (block.type === 'text') {
      parts.push(`
        ${block.title ? `<h2>${esc(block.title)}</h2>` : ''}
        ${block.body ? `<p class="body-text">${esc(block.body)}</p>` : ''}`);
    } else if (block.type === 'recommendation') {
      parts.push(`
        <div class="rec">
          <div class="rec-label">Recomendação técnica</div>
          ${block.title ? `<div class="rec-title">${esc(block.title)}</div>` : ''}
          ${block.body ? `<div class="rec-body">${esc(block.body)}</div>` : ''}
        </div>`);
    } else if (block.type === 'image') {
      const dataUri = await toDataUri(block.uri);
      if (dataUri) {
        parts.push(`
          <figure class="fig">
            <img src="${dataUri}"/>
            ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}
          </figure>`);
      }
    }
  }
  return parts.join('');
}

async function buildHtml(input: TechReportInput): Promise<string> {
  const obsCount = input.visits.reduce((n, v) => n + v.observations.length, 0);
  const recCount = input.blocks.filter((b) => b.type === 'recommendation').length;
  const emission = new Date().toLocaleDateString('pt-BR');

  return `
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8"/>
        <style>
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Helvetica, Roboto, sans-serif; color: #1F2A20; margin: 0; font-size: 12.5px; line-height: 1.5; }
          .band { background: #1B5E20; background: linear-gradient(120deg, #1B5E20, #2E7D32); color: #fff; padding: 30px 36px 24px; }
          .band .kind { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; opacity: 0.85; }
          .band h1 { margin: 6px 0 4px; font-size: 25px; line-height: 1.2; }
          .band .sub { font-size: 13px; opacity: 0.9; }
          .band .brand { margin-top: 14px; font-size: 10.5px; opacity: 0.75; letter-spacing: 1px; }
          .content { padding: 24px 36px 32px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
          .info-cell { padding: 8px 12px 8px 0; vertical-align: top; width: 33%; }
          .info-label { font-size: 9.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #798A7B; }
          .info-value { font-weight: 700; margin-top: 1px; }
          .stats { margin: 6px 0 4px; }
          .stat { display: inline-block; background: #F0F5F0; border-radius: 999px; padding: 4px 12px; margin-right: 6px; font-size: 11px; font-weight: 700; color: #2E5A31; }
          hr.rule { border: none; border-top: 1px solid #E2E9E2; margin: 16px 0 18px; }
          h2 { font-size: 15px; margin: 22px 0 10px; padding-left: 10px; border-left: 4px solid #2E7D32; color: #1B3D1E; }
          .body-text { margin: 0 0 8px; white-space: normal; }
          .rec { border: 1px solid #CBE3CC; background: #F1F8F1; border-radius: 10px; padding: 14px 16px; margin: 14px 0; page-break-inside: avoid; }
          .rec-label { font-size: 9.5px; letter-spacing: 1.5px; text-transform: uppercase; color: #2E7D32; font-weight: 700; margin-bottom: 4px; }
          .rec-title { font-weight: 700; font-size: 13.5px; margin-bottom: 3px; }
          .fig { margin: 14px 0; text-align: center; page-break-inside: avoid; }
          .fig img { max-width: 100%; max-height: 340px; border-radius: 8px; }
          .fig figcaption { font-size: 11px; color: #798A7B; margin-top: 5px; font-style: italic; }
          .visit { border: 1px solid #E2E9E2; border-radius: 10px; padding: 14px 16px; margin: 12px 0; page-break-inside: avoid; }
          .visit-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1px solid #EDF2ED; padding-bottom: 8px; margin-bottom: 8px; }
          .visit-title { font-weight: 700; font-size: 14px; }
          .visit-meta { font-size: 11px; color: #798A7B; }
          .visit-notes { font-size: 12px; color: #47554A; margin-bottom: 8px; }
          .obs { padding: 10px 0; border-top: 1px dashed #E2E9E2; page-break-inside: avoid; }
          .obs:first-of-type { border-top: none; }
          .obs-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
          .obs-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #2E7D32; color: #fff; font-size: 11px; font-weight: 700; }
          .obs-name { font-weight: 700; }
          .tag { border-radius: 4px; padding: 1.5px 7px; font-size: 10px; font-weight: 700; }
          .tag-pest { background: #FDECEA; color: #C62828; }
          .tag-disease { background: #F1E6F7; color: #6A1B9A; }
          .badge { border-radius: 4px; padding: 1.5px 7px; font-size: 10px; font-weight: 700; }
          .obs-meta { font-size: 11px; color: #798A7B; margin-top: 3px; }
          .obs-notes { margin-top: 5px; background: #F7FAF7; border-radius: 6px; padding: 7px 10px; font-size: 12px; }
          .photos { margin-top: 8px; }
          .photos img { width: 138px; height: 138px; object-fit: cover; border-radius: 6px; margin: 0 6px 6px 0; }
          .muted { color: #798A7B; font-size: 12px; }
          .footer { margin-top: 28px; border-top: 1px solid #E2E9E2; padding-top: 10px; font-size: 10px; color: #97A599; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="band">
          <div class="kind">Relatório técnico de monitoramento</div>
          <h1>${esc(input.title)}</h1>
          <div class="sub">${esc(input.farmNames.join(' · ') || 'Sem fazenda vinculada')}${input.period ? ` &nbsp;•&nbsp; ${esc(input.period)}` : ''}</div>
          <div class="brand">TENAMONITORE · MONITORAMENTO DE TALHÕES</div>
        </div>
        <div class="content">
          <table class="info-table"><tr>
            ${infoCell('Produtor', input.ownerNames.join(', ') || '—')}
            ${infoCell('Fazenda', input.farmNames.join(', ') || '—')}
            ${infoCell('Período', input.period ?? '—')}
          </tr><tr>
            ${infoCell('Responsável técnico', input.consultantName ?? '—')}
            ${infoCell('Visitas', String(input.visits.length))}
            ${infoCell('Emissão', emission)}
          </tr></table>

          <div class="stats">
            <span class="stat">${input.visits.length} visita${input.visits.length === 1 ? '' : 's'}</span>
            <span class="stat">${obsCount} observaç${obsCount === 1 ? 'ão' : 'ões'}</span>
            ${recCount > 0 ? `<span class="stat">${recCount} recomendaç${recCount === 1 ? 'ão' : 'ões'}</span>` : ''}
          </div>
          <hr class="rule"/>

          ${await renderBlocks(input)}

          <div class="footer">
            <span>${esc(input.consultantName ?? '')}</span>
            <span>Gerado com TenaMonitore em ${new Date().toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </body>
    </html>`;
}

/** Gera o PDF do relatório técnico e abre a folha de compartilhamento. */
export async function shareTechReport(input: TechReportInput): Promise<void> {
  const html = await buildHtml(input);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: input.title,
    });
  }
}
