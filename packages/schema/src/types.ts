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
  | 'array'

export type ArraySubFieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'media'

export type NumberSubtype = 'integer' | 'float'

export type FieldWidth = 'full' | 'two-thirds' | 'half' | 'third'

export type MediaAllowedType = 'image' | 'video' | 'audio' | 'document'

export type RelationType = 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'

export interface ArraySubField {
  name: string
  type: ArraySubFieldType
  required?: boolean
  subtype?: NumberSubtype
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
}

export interface FieldDefinition {
  name: string
  type: FieldType
  required?: boolean
  subtype?: NumberSubtype
  relationType?: RelationType
  relatedTable?: string
  relatedSlug?: string
  relatedField?: string
  targetField?: string
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
  arrayFields?: ArraySubField[]
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
