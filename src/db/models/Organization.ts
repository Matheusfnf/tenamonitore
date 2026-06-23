import { Model } from '@nozbe/watermelondb';
import { text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

export class Organization extends Model {
  static table = 'organizations';
  static associations: Associations = {
    profiles: { type: 'has_many', foreignKey: 'organization_id' },
    farms: { type: 'has_many', foreignKey: 'organization_id' },
  };

  @text('name') name: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @children('farms') farms: any;
}
