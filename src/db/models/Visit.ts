import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Visita técnica de um consultor a uma fazenda. Base do relatório diário. */
export class Visit extends Model {
  static table = 'visits';
  static associations: Associations = {
    farms: { type: 'belongs_to', key: 'farm_id' },
    profiles: { type: 'belongs_to', key: 'consultant_id' },
    observations: { type: 'has_many', foreignKey: 'visit_id' },
    recommendations: { type: 'has_many', foreignKey: 'visit_id' },
    reports: { type: 'has_many', foreignKey: 'visit_id' },
  };

  @text('farm_id') farmId: string;
  @text('consultant_id') consultantId: string;
  @text('visit_date') visitDate: string;
  @text('status') status: string; // 'open' | 'closed'
  @text('weather') weather: string | null;
  @text('notes') notes: string | null;
  @field('lat') lat: number | null;
  @field('lng') lng: number | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('farms', 'farm_id') farm: any;
  @children('observations') observations: any;
  @children('recommendations') recommendations: any;
}
