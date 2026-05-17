import type { FieldDef } from '@/shared/components/content/FieldInput.tsx'

export type ContentType = {
  name: string
  slug: string
  kind: 'collection' | 'single'
  previewEnabled?: boolean
  fields: FieldDef[]
}

export type Entry = Record<string, unknown> & {
  id?: string
  created_by?: string | null
  status?: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  published_data?: Record<string, unknown> | null
  scheduled_for?: string | null
  editor_id?: string | null
  review_locked_by_editor?: boolean
  review_rejected?: boolean
  _editor_first_name?: string | null
  _editor_last_name?: string | null
  _editor_avatar_url?: string | null
}

export type UserOption = {
  id: string
  role_name?: string
  first_name?: string | null
  last_name?: string | null
}

export type LocalizedMeta = { enabled?: boolean; primary?: string }

export type LocalizedData = Record<string, unknown> & { _meta?: LocalizedMeta }
