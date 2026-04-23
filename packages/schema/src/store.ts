import { pool, createId } from '@plank/db'
import type { ContentType } from './types.js'

type ContentTypeRow = {
  id: string
  name: string
  slug: string
  table_name: string
  fields: ContentType['fields']
  is_default: boolean
  created_at: Date
  updated_at: Date
}

function rowToContentType(row: ContentTypeRow): ContentType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tableName: row.table_name,
    fields: row.fields,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findAllContentTypes(): Promise<ContentType[]> {
  const { rows } = await pool.query<ContentTypeRow>(
    'SELECT * FROM plank_content_types ORDER BY name',
  )
  return rows.map(rowToContentType)
}

export async function findContentTypeBySlug(slug: string): Promise<ContentType | null> {
  const { rows } = await pool.query<ContentTypeRow>(
    'SELECT * FROM plank_content_types WHERE slug = $1',
    [slug],
  )
  return rows[0] ? rowToContentType(rows[0]) : null
}

export async function saveContentType(contentType: ContentType): Promise<ContentType> {
  const { rows } = await pool.query<ContentTypeRow>(
    `INSERT INTO plank_content_types (id, name, slug, table_name, fields)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [createId(), contentType.name, contentType.slug, contentType.tableName, JSON.stringify(contentType.fields)],
  )
  return rowToContentType(rows[0])
}

export async function updateContentType(
  slug: string,
  contentType: ContentType,
): Promise<ContentType> {
  const { rows } = await pool.query<ContentTypeRow>(
    `UPDATE plank_content_types
     SET name = $1, fields = $2, updated_at = NOW()
     WHERE slug = $3
     RETURNING *`,
    [contentType.name, JSON.stringify(contentType.fields), slug],
  )
  return rowToContentType(rows[0])
}

export async function setDefaultContentType(slug: string): Promise<ContentType> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE plank_content_types SET is_default = false')
    const { rows } = await client.query<ContentTypeRow>(
      'UPDATE plank_content_types SET is_default = true WHERE slug = $1 RETURNING *',
      [slug],
    )
    if (!rows[0]) throw new Error(`Content type "${slug}" not found`)
    await client.query('COMMIT')
    return rowToContentType(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function deleteContentType(slug: string): Promise<void> {
  await pool.query('DELETE FROM plank_content_types WHERE slug = $1', [slug])
}
