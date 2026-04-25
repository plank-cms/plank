import { pool } from '@plank/db'
import { assertSafeIdentifier, toPostgresType, isVirtualRelation, hasRelationColumn } from './fieldTypes.js'
import type { ContentType, FieldDefinition } from './types.js'
import { findAllContentTypes } from './store.js'

function buildColumnDef(field: FieldDefinition): string | null {
  if (isVirtualRelation(field)) return null
  assertSafeIdentifier(field.name)
  const pgType = toPostgresType(field)
  const notNull = field.required ? ' NOT NULL' : ''
  return `${field.name} ${pgType}${notNull}`
}

function junctionTableName(sourceTable: string, fieldName: string): string {
  return `_rel_${sourceTable}_${fieldName}`
}

function buildJunctionTableSQL(sourceTable: string, fieldName: string, targetTable: string): string {
  const jt = junctionTableName(sourceTable, fieldName)
  assertSafeIdentifier(targetTable)
  return [
    `CREATE TABLE IF NOT EXISTS ${jt} (`,
    `  source_id TEXT NOT NULL REFERENCES ${sourceTable}(id) ON DELETE CASCADE,`,
    `  target_id TEXT NOT NULL REFERENCES ${targetTable}(id) ON DELETE CASCADE,`,
    `  PRIMARY KEY (source_id, target_id)`,
    `)`,
  ].join('\n')
}

function relationSignature(field: FieldDefinition): string {
  if (field.type !== 'relation') return ''
  const rt = field.relationType ?? 'many-to-one'
  return `${rt}:${field.relatedTable ?? ''}`
}

export async function createTable(contentType: ContentType): Promise<void> {
  assertSafeIdentifier(contentType.tableName)

  const columnFields = contentType.fields.filter((f) => !isVirtualRelation(f))
  const columns = columnFields.map(buildColumnDef).filter(Boolean) as string[]

  const sql = [
    `CREATE TABLE IF NOT EXISTS ${contentType.tableName} (`,
    `  id         TEXT PRIMARY KEY,`,
    ...columns.map((col) => `  ${col},`),
    `  status         VARCHAR(20) NOT NULL DEFAULT 'draft',`,
    `  published_data JSONB,`,
    `  published_at   TIMESTAMP,`,
    `  scheduled_for  TIMESTAMP,`,
    `  created_by     TEXT REFERENCES plank_users(id) ON DELETE SET NULL,`,
    `  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),`,
    `  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()`,
    `)`,
  ].join('\n')

  await pool.query(sql)

  for (const field of contentType.fields) {
    if (field.type === 'relation' && (field.relationType ?? 'many-to-one') === 'many-to-many' && field.relatedTable) {
      await pool.query(buildJunctionTableSQL(contentType.tableName, field.name, field.relatedTable))
    }
  }
}

export async function syncTable(
  next: ContentType,
  prev: ContentType,
): Promise<void> {
  assertSafeIdentifier(next.tableName)

  const prevFields = new Map(prev.fields.map((f) => [f.name, f]))
  const nextFields = new Map(next.fields.map((f) => [f.name, f]))

  const statements: string[] = []
  const junctionOps: Array<() => Promise<unknown>> = []

  for (const [name, field] of nextFields) {
    if (!prevFields.has(name)) {
      if (isVirtualRelation(field)) continue

      assertSafeIdentifier(name)
      const colDef = buildColumnDef(field)
      if (colDef) statements.push(`ALTER TABLE ${next.tableName} ADD COLUMN IF NOT EXISTS ${colDef}`)

      if (field.type === 'relation' && (field.relationType ?? 'many-to-one') === 'many-to-many' && field.relatedTable) {
        const sql = buildJunctionTableSQL(next.tableName, name, field.relatedTable)
        junctionOps.push(() => pool.query(sql))
      }
    }
  }

  for (const [name] of prevFields) {
    if (!nextFields.has(name)) {
      const prevField = prevFields.get(name)!
      assertSafeIdentifier(name)

      if (!isVirtualRelation(prevField)) {
        statements.push(`ALTER TABLE ${next.tableName} DROP COLUMN ${name}`)
      }

      if (prevField.type === 'relation' && (prevField.relationType ?? 'many-to-one') === 'many-to-many') {
        const jt = junctionTableName(next.tableName, name)
        junctionOps.push(() => pool.query(`DROP TABLE IF EXISTS ${jt}`))
      }
    }
  }

  for (const [name, nextField] of nextFields) {
    const prevField = prevFields.get(name)
    if (!prevField) continue

    if (nextField.type === 'relation' || prevField.type === 'relation') {
      const prevSig = relationSignature(prevField)
      const nextSig = relationSignature(nextField)
      if (prevSig === nextSig) continue

      assertSafeIdentifier(name)

      if (prevField.type === 'relation' && (prevField.relationType ?? 'many-to-one') === 'many-to-many') {
        const jt = junctionTableName(next.tableName, name)
        junctionOps.push(() => pool.query(`DROP TABLE IF EXISTS ${jt}`))
      }

      if (hasRelationColumn(prevField)) {
        statements.push(`ALTER TABLE ${next.tableName} DROP COLUMN IF EXISTS ${name}`)
      }

      if (hasRelationColumn(nextField)) {
        const colDef = buildColumnDef(nextField)
        if (colDef) statements.push(`ALTER TABLE ${next.tableName} ADD COLUMN IF NOT EXISTS ${colDef}`)
      }

      if (nextField.type === 'relation' && (nextField.relationType ?? 'many-to-one') === 'many-to-many' && nextField.relatedTable) {
        const sql = buildJunctionTableSQL(next.tableName, name, nextField.relatedTable)
        junctionOps.push(() => pool.query(sql))
      }

      continue
    }

    if (toPostgresType(prevField) !== toPostgresType(nextField)) {
      assertSafeIdentifier(name)
      const pgType = toPostgresType(nextField)
      statements.push(
        `ALTER TABLE ${next.tableName} ALTER COLUMN ${name} TYPE ${pgType} USING ${name}::text::${pgType}`,
      )
    }
  }

  if (statements.length > 0) {
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

    for (const op of junctionOps) {
      await op()
    }
  }
}

export async function syncAllTables(): Promise<void> {
  const contentTypes = await findAllContentTypes()

  for (const ct of contentTypes) {
    assertSafeIdentifier(ct.tableName)

    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [ct.tableName],
    )
    const existingColumns = new Set(rows.map((r) => r.column_name))

    for (const field of ct.fields) {
      if (isVirtualRelation(field)) continue
      if (existingColumns.has(field.name)) continue

      assertSafeIdentifier(field.name)
      const colDef = buildColumnDef(field)
      if (colDef) {
        await pool.query(`ALTER TABLE ${ct.tableName} ADD COLUMN IF NOT EXISTS ${colDef}`)
        console.log(`[plank] Added missing column "${field.name}" to table "${ct.tableName}"`)
      }

      if (field.type === 'relation' && (field.relationType ?? 'many-to-one') === 'many-to-many' && field.relatedTable) {
        await pool.query(buildJunctionTableSQL(ct.tableName, field.name, field.relatedTable))
        console.log(`[plank] Created missing junction table for "${ct.tableName}.${field.name}"`)
      }
    }
  }
}
