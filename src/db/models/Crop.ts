import { Model } from '@nozbe/watermelondb';
import { text, date, readonly } from '@nozbe/watermelondb/decorators';

export class Crop extends Model {
  static table = 'crops';

  @text('organization_id') organizationId: string;
  @text('name') name: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
