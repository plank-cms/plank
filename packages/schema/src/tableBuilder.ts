import { pool } from '@plank-cms/db'
import {
  assertSafeIdentifier,
  quoteIdentifier,
  toPostgresType,
  isVirtualField,
  hasRelationColumn,
  ownsManyToManyRelation,
} from './fieldTypes.js'
import type { ContentType, FieldDefinition } from './types.js'
import { findAllContentTypes } from './store.js'

function buildColumnDef(field: FieldDefinition): string | null {
  if (isVirtualField(field)) return null
  assertSafeIdentifier(field.name)
  const pgType = toPostgresType(field)
  const notNull = field.required ? ' NOT NULL' : ''
  return `${quoteIdentifier(field.name)} ${pgType}${notNull}`
}

function junctionTableName(sourceTable: string, fieldName: string): string {
  return `_rel_${sourceTable}_${fieldName}`
}

function buildJunctionTableSQL(
  sourceTable: string,
  fieldName: string,
  targetTable: string,
): string {
  const jt = junctionTableName(sourceTable, fieldName)
  assertSafeIdentifier(targetTable)
  const quotedJt = quoteIdentifier(jt)
  const quotedSourceTable = quoteIdentifier(sourceTable)
  const quotedTargetTable = quoteIdentifier(targetTable)
  return [
    `CREATE TABLE IF NOT EXISTS ${quotedJt} (`,
    `  source_id TEXT NOT NULL REFERENCES ${quotedSourceTable}(id) ON DELETE CASCADE,`,
    `  target_id TEXT NOT NULL REFERENCES ${quotedTargetTable}(id) ON DELETE CASCADE,`,
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
  const quotedTableName = quoteIdentifier(contentType.tableName)

  const columnFields = contentType.fields.filter((f) => !isVirtualField(f))
  const columns = columnFields.map(buildColumnDef).filter(Boolean) as string[]

  const sql = [
    `CREATE TABLE IF NOT EXISTS ${quotedTableName} (`,
    `  id         TEXT PRIMARY KEY,`,
    ...columns.map((col) => `  ${col},`),
    `  localized      JSONB,`,
    `  status         VARCHAR(20) NOT NULL DEFAULT 'draft',`,
    `  published_data JSONB,`,
    `  published_at   TIMESTAMP,`,
    `  scheduled_for  TIMESTAMP,`,
    `  created_by     TEXT REFERENCES plank_users(id) ON DELETE SET NULL,`,
    `  editor_id      TEXT REFERENCES plank_users(id) ON DELETE SET NULL,`,
    `  review_locked_by_editor BOOLEAN NOT NULL DEFAULT FALSE,`,
    `  review_rejected BOOLEAN NOT NULL DEFAULT FALSE,`,
    `  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),`,
    `  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()`,
    `)`,
  ].join('\n')

  await pool.query(sql)

  // Create a GIN index for the localized JSONB column to support locale queries
  try {
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_${contentType.tableName}_localized_gin ON ${quotedTableName} USING gin (localized)`,
    )
  } catch {
    // ignore index creation errors
  }

  for (const field of contentType.fields) {
    if (ownsManyToManyRelation(field) && field.relatedTable) {
      await pool.query(buildJunctionTableSQL(contentType.tableName, field.name, field.relatedTable))
    }
  }
}

export async function syncTable(next: ContentType, prev: ContentType): Promise<void> {
  assertSafeIdentifier(next.tableName)
  const quotedTableName = quoteIdentifier(next.tableName)

  const prevFields = new Map(prev.fields.map((f) => [f.name, f]))
  const nextFields = new Map(next.fields.map((f) => [f.name, f]))

  const statements: string[] = []
  const junctionOps: Array<() => Promise<unknown>> = []

  for (const [name, field] of nextFields) {
    if (!prevFields.has(name)) {
      if (isVirtualField(field)) continue

      assertSafeIdentifier(name)
      const colDef = buildColumnDef(field)
      if (colDef)
        statements.push(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS ${colDef}`)

      if (ownsManyToManyRelation(field) && field.relatedTable) {
        const sql = buildJunctionTableSQL(next.tableName, name, field.relatedTable)
        junctionOps.push(() => pool.query(sql))
      }
    }
  }

  for (const [name] of prevFields) {
    if (!nextFields.has(name)) {
      const prevField = prevFields.get(name)!
      assertSafeIdentifier(name)

      if (!isVirtualField(prevField)) {
        statements.push(`ALTER TABLE ${quotedTableName} DROP COLUMN ${quoteIdentifier(name)}`)
      }

      if (ownsManyToManyRelation(prevField)) {
        const jt = junctionTableName(next.tableName, name)
        junctionOps.push(() => pool.query(`DROP TABLE IF EXISTS ${jt}`))
      }
    }
  }

  for (const [name, nextField] of nextFields) {
    const prevField = prevFields.get(name)
    if (!prevField) continue

    if (prevField.type === 'separator' || nextField.type === 'separator') {
      assertSafeIdentifier(name)

      if (!isVirtualField(prevField)) {
        statements.push(
          `ALTER TABLE ${quotedTableName} DROP COLUMN IF EXISTS ${quoteIdentifier(name)}`,
        )
      } else if (ownsManyToManyRelation(prevField)) {
        const junctionTable = junctionTableName(next.tableName, name)
        junctionOps.push(() => pool.query(`DROP TABLE IF EXISTS ${junctionTable}`))
      }

      if (!isVirtualField(nextField)) {
        const colDef = buildColumnDef(nextField)
        if (colDef) {
          statements.push(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS ${colDef}`)
        }
      } else if (ownsManyToManyRelation(nextField) && nextField.relatedTable) {
        const sql = buildJunctionTableSQL(next.tableName, name, nextField.relatedTable)
        junctionOps.push(() => pool.query(sql))
      }

      continue
    }

    if (nextField.type === 'relation' || prevField.type === 'relation') {
      const prevSig = relationSignature(prevField)
      const nextSig = relationSignature(nextField)
      if (prevSig === nextSig) continue

      assertSafeIdentifier(name)

      if (ownsManyToManyRelation(prevField)) {
        const jt = junctionTableName(next.tableName, name)
        junctionOps.push(() => pool.query(`DROP TABLE IF EXISTS ${jt}`))
      }

      if (hasRelationColumn(prevField)) {
        statements.push(`ALTER TABLE ${quotedTableName} DROP COLUMN IF EXISTS ${quoteIdentifier(name)}`)
      }

      if (hasRelationColumn(nextField)) {
        const colDef = buildColumnDef(nextField)
        if (colDef)
          statements.push(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS ${colDef}`)
      }

      if (ownsManyToManyRelation(nextField) && nextField.relatedTable) {
        const sql = buildJunctionTableSQL(next.tableName, name, nextField.relatedTable)
        junctionOps.push(() => pool.query(sql))
      }

      continue
    }

    if (toPostgresType(prevField) !== toPostgresType(nextField)) {
      assertSafeIdentifier(name)
      const pgType = toPostgresType(nextField)
      statements.push(
        `ALTER TABLE ${quotedTableName} ALTER COLUMN ${quoteIdentifier(name)} TYPE ${pgType} USING ${quoteIdentifier(name)}::text::${pgType}`,
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
  }

  for (const op of junctionOps) {
    await op()
  }
}

export async function syncAllTables(): Promise<void> {
  const contentTypes = await findAllContentTypes()

  for (const ct of contentTypes) {
    assertSafeIdentifier(ct.tableName)
    const quotedTableName = quoteIdentifier(ct.tableName)

    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [ct.tableName],
    )
    const existingColumns = new Set(rows.map((r) => r.column_name))

    // Ensure `localized` column exists on existing tables to support per-entry JSONB localization
    if (!existingColumns.has('localized')) {
      try {
        await pool.query(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS localized JSONB`)
        existingColumns.add('localized')
        try {
          await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_${ct.tableName}_localized_gin ON ${quotedTableName} USING gin (localized)`,
          )
        } catch {
          // ignore index creation errors
        }
        console.log(`[plank] Added missing column "localized" to table "${ct.tableName}"`)
      } catch {
        // table may not exist or other race conditions; ignore and continue
      }
    }

    // Ensure editorial workflow columns exist on all entry tables.
    if (!existingColumns.has('editor_id')) {
      try {
        await pool.query(
          `ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS editor_id TEXT REFERENCES plank_users(id) ON DELETE SET NULL`,
        )
        existingColumns.add('editor_id')
      } catch {
        // ignore and continue
      }
    }

    if (!existingColumns.has('review_locked_by_editor')) {
      try {
        await pool.query(
          `ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS review_locked_by_editor BOOLEAN NOT NULL DEFAULT FALSE`,
        )
        existingColumns.add('review_locked_by_editor')
      } catch {
        // ignore and continue
      }
    }

    if (!existingColumns.has('review_rejected')) {
      try {
        await pool.query(
          `ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS review_rejected BOOLEAN NOT NULL DEFAULT FALSE`,
        )
        existingColumns.add('review_rejected')
      } catch {
        // ignore and continue
      }
    }

    for (const field of ct.fields) {
      if (!isVirtualField(field) && !existingColumns.has(field.name)) {
        assertSafeIdentifier(field.name)
        const colDef = buildColumnDef(field)
        if (colDef) {
          await pool.query(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS ${colDef}`)
          console.log(`[plank] Added missing column "${field.name}" to table "${ct.tableName}"`)
        }
      }

      if (ownsManyToManyRelation(field) && field.relatedTable) {
        await pool.query(buildJunctionTableSQL(ct.tableName, field.name, field.relatedTable))
        console.log(`[plank] Created missing junction table for "${ct.tableName}.${field.name}"`)
      }
    }
  }
}
