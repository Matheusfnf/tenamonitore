import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Schema local (SQLite via WatermelonDB).
 * Espelha as tabelas do Postgres, EXCETO as colunas server-only
 * (deleted_at e last_modified_at): exclusões são tratadas pelo próprio
 * WatermelonDB (markAsDeleted) e o cursor de sync vive no servidor.
 * Os nomes das colunas são iguais aos do Postgres p/ um sync 1:1.
 */
export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'organizations',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'organization_id', type: 'string', isOptional: true },
        { name: 'full_name', type: 'string', isOptional: true },
        { name: 'role', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'crops',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'threats',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'scientific_name', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'farms',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'owner_name', type: 'string', isOptional: true },
        { name: 'municipality', type: 'string', isOptional: true },
        { name: 'state', type: 'string', isOptional: true },
        { name: 'center_lat', type: 'number', isOptional: true },
        { name: 'center_lng', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'fields',
      columns: [
        { name: 'farm_id', type: 'string', isIndexed: true },
        { name: 'crop_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'area_ha', type: 'number', isOptional: true },
        { name: 'boundary', type: 'string', isOptional: true }, // GeoJSON serializado
        { name: 'season', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'assignments',
      columns: [
        { name: 'farm_id', type: 'string', isIndexed: true },
        { name: 'consultant_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'visits',
      columns: [
        { name: 'farm_id', type: 'string', isIndexed: true },
        { name: 'consultant_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'visit_date', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'weather', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'lat', type: 'number', isOptional: true },
        { name: 'lng', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'observations',
      columns: [
        { name: 'visit_id', type: 'string', isIndexed: true },
        { name: 'field_id', type: 'string', isOptional: true },
        { name: 'threat_id', type: 'string', isOptional: true },
        { name: 'severity', type: 'number', isOptional: true },
        { name: 'incidence', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'lat', type: 'number', isOptional: true },
        { name: 'lng', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'observation_photos',
      columns: [
        { name: 'observation_id', type: 'string', isIndexed: true },
        { name: 'storage_path', type: 'string', isOptional: true },
        { name: 'local_uri', type: 'string', isOptional: true },
        { name: 'uploaded', type: 'boolean' },
        { name: 'lat', type: 'number', isOptional: true },
        { name: 'lng', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recommendations',
      columns: [
        { name: 'visit_id', type: 'string', isIndexed: true },
        { name: 'observation_id', type: 'string', isOptional: true },
        { name: 'text', type: 'string' },
        { name: 'product', type: 'string', isOptional: true },
        { name: 'dose', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'reports',
      columns: [
        { name: 'visit_id', type: 'string', isIndexed: true },
        { name: 'summary', type: 'string', isOptional: true },
        { name: 'pdf_path', type: 'string', isOptional: true },
        { name: 'generated_at', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
