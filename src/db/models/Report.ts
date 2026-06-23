import { Model } from '@nozbe/watermelondb';
import { text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Artefato do relatório diário gerado a partir de uma visita (PDF). */
export class Report extends Model {
  static table = 'reports';
  static associations: Associations = {
    visits: { type: 'belongs_to', key: 'visit_id' },
  };

  @text('visit_id') visitId: string;
  @text('summary') summary: string | null;
  @text('pdf_path') pdfPath: string | null;
  @text('generated_at') generatedAt: string | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('visits', 'visit_id') visit: any;
}
