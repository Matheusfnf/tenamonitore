import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Observação de praga/doença em um talhão, dentro de uma visita. */
export class Observation extends Model {
  static table = 'observations';
  static associations: Associations = {
    visits: { type: 'belongs_to', key: 'visit_id' },
    fields: { type: 'belongs_to', key: 'field_id' },
    threats: { type: 'belongs_to', key: 'threat_id' },
    observation_photos: { type: 'has_many', foreignKey: 'observation_id' },
  };

  @text('visit_id') visitId: string;
  @text('field_id') fieldId: string | null;
  @text('threat_id') threatId: string | null;
  @field('severity') severity: number | null;
  @field('incidence') incidence: number | null;
  @text('notes') notes: string | null;
  @field('lat') lat: number | null;
  @field('lng') lng: number | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('visits', 'visit_id') visit: any;
  @relation('fields', 'field_id') talhao: any;
  @relation('threats', 'threat_id') threat: any;
  @children('observation_photos') photos: any;
}
