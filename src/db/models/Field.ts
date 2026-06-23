import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Associations } from '@nozbe/watermelondb/Model';
import type { Polygon } from 'geojson';

/** Talhão: subdivisão geográfica de uma fazenda (polígono GeoJSON). */
export class Field extends Model {
  static table = 'fields';
  static associations: Associations = {
    farms: { type: 'belongs_to', key: 'farm_id' },
    crops: { type: 'belongs_to', key: 'crop_id' },
    observations: { type: 'has_many', foreignKey: 'field_id' },
  };

  @text('farm_id') farmId: string;
  @text('crop_id') cropId: string | null;
  @text('name') name: string;
  @field('area_ha') areaHa: number | null;
  @text('boundary') boundary: string | null; // GeoJSON Polygon serializado
  @text('season') season: string | null;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('farms', 'farm_id') farm: any;
  @relation('crops', 'crop_id') crop: any;

  /** Polígono parseado (GeoJSON) ou null. */
  get geometry(): Polygon | null {
    if (!this.boundary) return null;
    try {
      return JSON.parse(this.boundary) as Polygon;
    } catch {
      return null;
    }
  }
}
