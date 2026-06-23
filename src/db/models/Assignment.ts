import { Model } from '@nozbe/watermelondb';
import { text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Atribuição de um consultor a uma fazenda (define o escopo do sync). */
export class Assignment extends Model {
  static table = 'assignments';
  static associations: Associations = {
    farms: { type: 'belongs_to', key: 'farm_id' },
    profiles: { type: 'belongs_to', key: 'consultant_id' },
  };

  @text('farm_id') farmId: string;
  @text('consultant_id') consultantId: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('farms', 'farm_id') farm: any;
}
