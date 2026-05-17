import type { ContentType } from '../types.ts'

export const RECENT_ENTRY_FIELD_PREFS_KEY = 'plank_dashboard_recent_entry_fields'

export function guessDefaultField(ct: ContentType): string {
  const preferred = ['title', 'name', 'entry']
  for (const p of preferred) {
    if (ct.fields.some((f) => f.name === p)) return p
  }
  const byType = ct.fields.find((f) => ['string', 'text', 'uid'].includes(f.type))
  return byType?.name ?? 'id'
}

export function toEntryLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Untitled'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
