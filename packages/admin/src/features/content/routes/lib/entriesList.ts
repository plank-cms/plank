import type {
  ColSort,
  ContentHealthSettings,
  EntryStatus,
  FieldDef,
  RelationCTField,
  ViewConfig,
} from '../types.ts'

export const DEFAULT_VISIBLE = 4
export const DEFAULT_SORT: ColSort = { field: 'created_at', dir: 'desc' }

export const SYSTEM_SORT_OPTIONS = [
  { name: 'created_at', label: 'Created' },
  { name: 'updated_at', label: 'Updated' },
  { name: 'published_at', label: 'Published' },
]

export const SYSTEM_COL_DEFS = [
  { name: 'created_at', label: 'Created' },
  { name: 'updated_at', label: 'Updated' },
  { name: 'pub_sch', label: 'Published' },
] as const

export const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  pending: 'Pending',
  in_review: 'In Review',
}

export const STATUS_ORDER: EntryStatus[] = ['draft', 'pending', 'in_review', 'scheduled', 'published']

export function humanize(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function parseContentHealthSettings(
  settings: Record<string, string> | null,
): ContentHealthSettings | null {
  if (!settings) return null

  const staleDraftDays = Number.parseInt(settings.staleDraftDays ?? '30', 10)
  const contentTypes = (() => {
    try {
      const parsed = JSON.parse(settings.contentTypes ?? '[]')
      if (!Array.isArray(parsed)) return []

      return parsed
        .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
        .map((value) => ({
          slug: typeof value.slug === 'string' ? value.slug : '',
          enabled: value.enabled !== false,
          checkStaleDrafts: value.checkStaleDrafts !== false,
          requiredTextFields: Array.isArray(value.requiredTextFields)
            ? value.requiredTextFields.filter((field): field is string => typeof field === 'string')
            : [],
          requiredMediaFields: Array.isArray(value.requiredMediaFields)
            ? value.requiredMediaFields.filter((field): field is string => typeof field === 'string')
            : [],
        }))
        .filter((value) => value.slug.length > 0)
    } catch {
      return []
    }
  })()

  return {
    contentTypes,
    staleDraftDays: Number.isFinite(staleDraftDays) ? staleDraftDays : 30,
  }
}

export function getStaleDraftAgeDays(updatedAt: string): number {
  const updated = new Date(updatedAt)
  if (Number.isNaN(updated.getTime())) return 0
  const diff = Date.now() - updated.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

export function isMissingTextValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function isMissingMediaValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) {
    return value.filter((item) => String(item ?? '').trim().length > 0).length === 0
  }
  return false
}

export function pickRelationDisplayField(fields: RelationCTField[]) {
  return (
    fields.find((f) => f.name === 'title')?.name ??
    fields.find((f) => f.name === 'name')?.name ??
    fields.find((f) => f.type === 'uid')?.name ??
    fields.find((f) => f.type === 'string')?.name ??
    null
  )
}

export function normalizeRelationIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  }

  const id = String(value ?? '').trim()
  return id ? [id] : []
}

export function defaultViewConfig(allFields: FieldDef[]): ViewConfig {
  return {
    visibleFields: allFields.slice(0, DEFAULT_VISIBLE).map((f) => f.name),
    visibleSystemCols: SYSTEM_COL_DEFS.map((c) => c.name),
    sort: DEFAULT_SORT,
  }
}

export function parseViewConfig(saved: Partial<ViewConfig> | null, allFields: FieldDef[]): ViewConfig {
  if (!saved) return defaultViewConfig(allFields)
  const visible = (saved.visibleFields ?? []).filter((n) => {
    const base = String(n).split('.')[0]
    return allFields.some((f) => f.name === base)
  })
  const visibleSystemCols = Array.isArray(saved.visibleSystemCols)
    ? saved.visibleSystemCols.filter((n) => SYSTEM_COL_DEFS.some((c) => c.name === n))
    : SYSTEM_COL_DEFS.map((c) => c.name)

  return {
    visibleFields:
      visible.length > 0 ? visible : allFields.slice(0, DEFAULT_VISIBLE).map((f) => f.name),
    visibleSystemCols,
    sort: saved.sort ?? DEFAULT_SORT,
  }
}

export async function fetchViewConfig(slug: string): Promise<Partial<ViewConfig> | null> {
  const res = await fetch(`/cms/admin/users/me/prefs/view_${slug}`, {
    credentials: 'include',
  })
  if (!res.ok) return null
  const { value } = (await res.json()) as { value: Partial<ViewConfig> | null }
  return value
}

export async function persistViewConfig(slug: string, config: ViewConfig): Promise<void> {
  await fetch(`/cms/admin/users/me/prefs/view_${slug}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: config }),
  })
}
