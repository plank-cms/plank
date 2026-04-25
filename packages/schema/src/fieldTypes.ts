import { type FieldDefinition, SchemaError } from './types.js'

export function toPostgresType(field: FieldDefinition): string {
  switch (field.type) {
    case 'string':
      return 'VARCHAR(255)'
    case 'text':
    case 'richtext':
      return 'TEXT'
    case 'number':
      return field.subtype === 'float' ? 'NUMERIC' : 'INTEGER'
    case 'boolean':
      return 'BOOLEAN'
    case 'datetime':
      return 'TIMESTAMP'
    case 'media':
      return 'TEXT'
    case 'media-gallery':
      return 'JSONB'
    case 'relation': {
      const relType = field.relationType ?? 'many-to-one'
      if (relType === 'one-to-many' || relType === 'many-to-many') {
        throw new SchemaError(`"${relType}" relation does not produce a column`)
      }
      if (!field.relatedTable) return 'TEXT'
      assertSafeIdentifier(field.relatedTable)
      const unique = relType === 'one-to-one' ? ' UNIQUE' : ''
      return `TEXT${unique} REFERENCES ${field.relatedTable}(id) ON DELETE SET NULL`
    }
    case 'uid':
      return 'VARCHAR(255) UNIQUE'
    default:
      throw new SchemaError(`Unknown field type: "${(field as FieldDefinition).type}"`)
  }
}

export function isVirtualRelation(field: FieldDefinition): boolean {
  if (field.type !== 'relation') return false
  const rt = field.relationType ?? 'many-to-one'
  return rt === 'one-to-many' || rt === 'many-to-many'
}

export function hasRelationColumn(field: FieldDefinition): boolean {
  if (field.type !== 'relation') return false
  const rt = field.relationType ?? 'many-to-one'
  return rt === 'many-to-one' || rt === 'one-to-one'
}

// Only lowercase letters, digits, and underscores — must start with a letter.
// Prevents SQL injection on identifiers that cannot be parameterized.
export function assertSafeIdentifier(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new SchemaError(
      `Invalid identifier "${name}". Use only lowercase letters, digits, and underscores.`,
    )
  }
}
