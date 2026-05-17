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
  | 'navigation'

export type RelationType = 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'

export type FieldDef = {
  name: string
  type: FieldType
  relationType?: RelationType
  relatedSlug?: string
}

export type ContentType = { name: string; slug: string; fields: FieldDef[] }

export type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  published_data: Record<string, unknown> | null
  published_at: string | null
  scheduled_for: string | null
  review_locked_by_editor?: boolean
  review_rejected?: boolean
  created_at: string
  updated_at: string
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}

export type EntryStatus = Entry['status']

export type EntriesResponse = {
  data: Entry[]
  total: number
  page: number
  limit: number
  available_statuses?: EntryStatus[]
}

export type ContentHealthSettings = {
  contentTypes: Array<{
    slug: string
    enabled: boolean
    checkStaleDrafts: boolean
    requiredTextFields?: string[]
    requiredMediaFields?: string[]
  }>
  staleDraftDays: number
}

export type ColSort = { field: string; dir: 'asc' | 'desc' }

export type ViewConfig = {
  visibleFields: string[]
  visibleSystemCols: string[]
  sort: ColSort
}

export type RelationCTField = { name: string; type: string }

export type RelationContentType = { fields?: RelationCTField[] }
