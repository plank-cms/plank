export type FieldDef = { name: string; type: string }

export type ContentType = {
  slug: string
  name: string
  kind: 'collection' | 'single'
  isDefault: boolean
  fields: FieldDef[]
}

export type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  published_at: string | null
  updated_at: string
  created_by: string | null
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}

export type EntriesResponse = { data: Entry[]; total: number }

export type RecentEntry = Entry & { slug: string; contentTypeName: string }

export type EntryFieldMap = Record<string, string>

export type DashboardStats = {
  totalEntries: number
  totalDrafts: number
  myDrafts: number
  totalScheduled: number
  myScheduled: number
}
