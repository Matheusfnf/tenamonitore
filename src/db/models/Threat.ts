import { Model } from '@nozbe/watermelondb';
import { text, date, readonly } from '@nozbe/watermelondb/decorators';

/** Praga (pest) ou doença (disease) do catálogo. */
export class Threat extends Model {
  static table = 'threats';

  @text('organization_id') organizationId: string;
  @text('name') name: string;
  @text('type') type: string; // 'pest' | 'disease'
  @text('scientific_name') scientificName: string | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
