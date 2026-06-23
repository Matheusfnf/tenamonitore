import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

export class Farm extends Model {
  static table = 'farms';
  static associations: Associations = {
    fields: { type: 'has_many', foreignKey: 'farm_id' },
    visits: { type: 'has_many', foreignKey: 'farm_id' },
    assignments: { type: 'has_many', foreignKey: 'farm_id' },
  };

  @text('organization_id') organizationId: string;
  @text('name') name: string;
  @text('owner_name') ownerName: string | null;
  @text('municipality') municipality: string | null;
  @text('state') state: string | null;
  @field('center_lat') centerLat: number | null;
  @field('center_lng') centerLng: number | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @children('fields') fields: any;
  @children('visits') visits: any;
  @children('assignments') assignments: any;
}
