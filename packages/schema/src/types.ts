export type FieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'media'
  | 'media-gallery'
  | 'relation'
  | 'uid'

export type NumberSubtype = 'integer' | 'float'

export type FieldWidth = 'full' | 'half' | 'third'

export type MediaAllowedType = 'image' | 'video' | 'audio' | 'document'

export interface FieldDefinition {
  name: string
  type: FieldType
  required?: boolean
  subtype?: NumberSubtype
  relatedTable?: string
  targetField?: string
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
}

export type ContentTypeKind = 'collection' | 'single'

export interface ContentType {
  id?: string
  name: string
  slug: string
  kind: ContentTypeKind
  tableName: string
  fields: FieldDefinition[]
  isDefault?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join(', '))
    this.name = 'ValidationError'
  }
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}
