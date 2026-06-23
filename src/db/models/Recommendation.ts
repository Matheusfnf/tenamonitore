import { Model } from '@nozbe/watermelondb';
import { text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Recomendação de manejo associada a uma visita (e opcionalmente a uma observação). */
export class Recommendation extends Model {
  static table = 'recommendations';
  static associations: Associations = {
    visits: { type: 'belongs_to', key: 'visit_id' },
    observations: { type: 'belongs_to', key: 'observation_id' },
  };

  @text('visit_id') visitId: string;
  @text('observation_id') observationId: string | null;
  @text('text') text: string;
  @text('product') product: string | null;
  @text('dose') dose: string | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('visits', 'visit_id') visit: any;
}
