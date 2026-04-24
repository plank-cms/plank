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
    case 'relation':
      return 'TEXT'
    case 'uid':
      return 'VARCHAR(255) UNIQUE'
    default:
      throw new SchemaError(`Unknown field type: "${(field as FieldDefinition).type}"`)
  }
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
