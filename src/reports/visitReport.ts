import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { SEVERITY_LABELS } from '@/lib/severity';

export interface ReportObservation {
  fieldName: string | null;
  threatName: string | null;
  threatType: string | null; // 'pest' | 'disease'
  severity: number | null;
  incidence: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  photoUris: string[];
}

export interface VisitReportData {
  farmName: string;
  visitName: string | null;
  ownerName: string | null;
  location: string | null;
  visitDate: string; // já formatada (dd/mm/aaaa)
  weather: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  observations: ReportObservation[];
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function coords(lat: number | null, lng: number | null): string | null {
  return lat != null && lng != null
    ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    : null;
}

/** Converte a foto local em data URI; foto perdida vira null (não quebra o PDF). */
async function photoToDataUri(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return `data:image/jpeg;base64,${await file.base64()}`;
  } catch {
    return null;
  }
}

async function buildHtml(data: VisitReportData): Promise<string> {
  const headerRows = [
    data.ownerName ? `<div><b>Produtor:</b> ${esc(data.ownerName)}</div>` : '',
    data.location ? `<div><b>Local:</b> ${esc(data.location)}</div>` : '',
    `<div><b>Data:</b> ${esc(data.visitDate)}</div>`,
    data.weather ? `<div><b>Clima:</b> ${esc(data.weather)}</div>` : '',
    coords(data.lat, data.lng)
      ? `<div><b>GPS:</b> ${coords(data.lat, data.lng)}</div>`
      : '',
  ].join('');

  const obsBlocks: string[] = [];
  for (const [i, obs] of data.observations.entries()) {
    const photos = (
      await Promise.all(obs.photoUris.map(photoToDataUri))
    ).filter((p): p is string => !!p);

    const title = obs.threatName
      ? `${esc(obs.threatName)}${obs.threatType ? ` <span class="tag">${obs.threatType === 'disease' ? 'Doença' : 'Praga'}</span>` : ''}`
      : 'Observação geral';

    obsBlocks.push(`
      <div class="obs">
        <h3>${i + 1}. ${title}</h3>
        ${obs.fieldName ? `<div><b>Talhão:</b> ${esc(obs.fieldName)}</div>` : ''}
        ${obs.severity != null ? `<div><b>Severidade:</b> ${obs.severity} — ${SEVERITY_LABELS[obs.severity] ?? ''}</div>` : ''}
        ${obs.incidence != null ? `<div><b>Incidência:</b> ${obs.incidence}% das plantas</div>` : ''}
        ${coords(obs.lat, obs.lng) ? `<div><b>GPS:</b> ${coords(obs.lat, obs.lng)}</div>` : ''}
        ${obs.notes ? `<div class="notes">${esc(obs.notes)}</div>` : ''}
        ${photos.length > 0 ? `<div class="photos">${photos.map((p) => `<img src="${p}"/>`).join('')}</div>` : ''}
      </div>`);
  }

  return `
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; color: #1a1a1a; padding: 24px; font-size: 13px; }
          h1 { font-size: 20px; margin: 0; }
          h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          h3 { font-size: 13px; margin: 0 0 6px; }
          .subtitle { color: #666; margin-bottom: 16px; }
          .header-info { display: grid; gap: 2px; }
          .obs { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
          .obs div { margin: 2px 0; }
          .tag { background: #e8f0e8; border-radius: 4px; padding: 1px 6px; font-size: 11px; color: #2d6a2d; }
          .notes { margin-top: 6px; padding: 8px; background: #f6f6f6; border-radius: 6px; }
          .photos { margin-top: 8px; }
          .photos img { width: 160px; height: 160px; object-fit: cover; border-radius: 6px; margin: 0 6px 6px 0; }
          .footer { margin-top: 24px; color: #999; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>Relatório de visita técnica</h1>
        <div class="subtitle">${esc(data.farmName)}${data.visitName ? ` — ${esc(data.visitName)}` : ''}</div>
        <div class="header-info">${headerRows}</div>
        ${data.notes ? `<h2>Observações gerais da visita</h2><div>${esc(data.notes)}</div>` : ''}
        <h2>Observações de campo (${data.observations.length})</h2>
        ${obsBlocks.join('') || '<div>Nenhuma observação registrada.</div>'}
        <div class="footer">Gerado pelo TenaMonitore em ${new Date().toLocaleString('pt-BR')}</div>
      </body>
    </html>`;
}

/** Gera o PDF da visita e abre a folha de compartilhamento do sistema. */
export async function shareVisitReport(data: VisitReportData): Promise<void> {
  const html = await buildHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Relatório — ${data.farmName} (${data.visitDate})`,
    });
  }
}
