import { Model } from '@nozbe/watermelondb';
import { text, date, readonly } from '@nozbe/watermelondb/decorators';

export class Profile extends Model {
  static table = 'profiles';

  @text('organization_id') organizationId: string | null;
  @text('full_name') fullName: string | null;
  @text('role') role: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  get isAdmin() {
    return this.role === 'admin';
  }
}
