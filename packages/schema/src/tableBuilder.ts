import { pool } from '@plank/db'
import { assertSafeIdentifier, toPostgresType } from './fieldTypes.js'
import type { ContentType, FieldDefinition } from './types.js'

function buildColumnDef(field: FieldDefinition): string {
  assertSafeIdentifier(field.name)
  const pgType = toPostgresType(field)
  const notNull = field.required ? ' NOT NULL' : ''
  return `${field.name} ${pgType}${notNull}`
}

export async function createTable(contentType: ContentType): Promise<void> {
  assertSafeIdentifier(contentType.tableName)

  const columns = contentType.fields.map(buildColumnDef)

  const sql = [
    `CREATE TABLE IF NOT EXISTS ${contentType.tableName} (`,
    `  id         TEXT PRIMARY KEY,`,
    ...columns.map((col) => `  ${col},`),
    `  status         VARCHAR(20) NOT NULL DEFAULT 'draft',`,
    `  published_data JSONB,`,
    `  published_at   TIMESTAMP,`,
    `  scheduled_for  TIMESTAMP,`,
    `  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),`,
    `  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()`,
    `)`,
  ].join('\n')

  await pool.query(sql)
}

export async function syncTable(
  next: ContentType,
  prev: ContentType,
): Promise<void> {
  assertSafeIdentifier(next.tableName)

  const prevFields = new Map(prev.fields.map((f) => [f.name, f]))
  const nextFields = new Map(next.fields.map((f) => [f.name, f]))

  const statements: string[] = []

  for (const [name, field] of nextFields) {
    if (!prevFields.has(name)) {
      // New field — ADD COLUMN
      assertSafeIdentifier(name)
      statements.push(
        `ALTER TABLE ${next.tableName} ADD COLUMN ${buildColumnDef(field)}`,
      )
    }
  }

  for (const [name] of prevFields) {
    if (!nextFields.has(name)) {
      // Removed field — DROP COLUMN
      assertSafeIdentifier(name)
      statements.push(`ALTER TABLE ${next.tableName} DROP COLUMN ${name}`)
    }
  }

  for (const [name, nextField] of nextFields) {
    const prevField = prevFields.get(name)
    if (!prevField) continue
    if (toPostgresType(prevField) !== toPostgresType(nextField)) {
      // Type changed — ALTER COLUMN TYPE
      assertSafeIdentifier(name)
      const pgType = toPostgresType(nextField)
      statements.push(
        `ALTER TABLE ${next.tableName} ALTER COLUMN ${name} TYPE ${pgType} USING ${name}::text::${pgType}`,
      )
    }
  }

  if (statements.length === 0) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const stmt of statements) {
      await client.query(stmt)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
