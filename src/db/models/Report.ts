import { Model } from '@nozbe/watermelondb';
import { text, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * Relatório técnico composto pelo consultor: pode reunir 0..N visitas
 * (`visit_ids`, JSON array) e blocos de conteúdo livre (`content`, JSON —
 * ver src/reports/reportContent.ts). `visit_id` é legado do relatório
 * rápido de uma visita e fica null nos relatórios novos.
 */
export class Report extends Model {
  static table = 'reports';

  @text('visit_id') visitId: string | null;
  @text('organization_id') organizationId: string | null;
  @text('consultant_id') consultantId: string | null;
  @text('farm_id') farmId: string | null;
  @text('title') title: string | null;
  @text('visit_ids') visitIds: string | null;
  @text('content') content: string | null;
  @text('summary') summary: string | null;
  @text('pdf_path') pdfPath: string | null;
  @text('generated_at') generatedAt: string | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
