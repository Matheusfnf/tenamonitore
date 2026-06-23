import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';

/** Foto de uma observação. O binário é enviado por fila própria (Storage). */
export class ObservationPhoto extends Model {
  static table = 'observation_photos';
  static associations: Associations = {
    observations: { type: 'belongs_to', key: 'observation_id' },
  };

  @text('observation_id') observationId: string;
  @text('storage_path') storagePath: string | null;
  @text('local_uri') localUri: string | null;
  @field('uploaded') uploaded: boolean;
  @field('lat') lat: number | null;
  @field('lng') lng: number | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('observations', 'observation_id') observation: any;
}
