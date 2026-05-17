import { CalendarClockIcon } from 'lucide-react'
import { useSettings } from '@/shared/context/settings.tsx'
import { formatDate } from '@/shared/lib/formatDate.ts'
import { Badge } from '@/shared/ui/badge.tsx'
import type { Entry, FieldDef } from '../types.ts'

type StatusBadgeProps = {
  entry: Entry
  fields: FieldDef[]
  isStaleDraft?: boolean
}

export function StatusBadge({ entry, fields, isStaleDraft = false }: StatusBadgeProps) {
  const { timezone } = useSettings()

  if (entry.status === 'scheduled') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-600">
        <CalendarClockIcon className="mr-1 size-3" />
        {entry.scheduled_for ? formatDate(entry.scheduled_for, timezone) : 'Scheduled'}
      </Badge>
    )
  }

  if (entry.status === 'draft') {
    if (isStaleDraft) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-500">
          Stale Draft
        </Badge>
      )
    }

    return <Badge variant="outline">Draft</Badge>
  }

  if (entry.status === 'pending') {
    if (entry.review_rejected) return <Badge variant="destructive">Pending</Badge>
    return <Badge className="bg-amber-500 text-black hover:bg-amber-500">Pending</Badge>
  }

  if (entry.status === 'in_review') return <Badge variant="outline">In Review</Badge>

  const normalize = (v: unknown, type: string) => {
    if (type === 'datetime' && v && typeof v === 'string') {
      const s = /Z|[+-]\d{2}:\d{2}$/.test(v) ? v : v + 'Z'
      const d = new Date(s)
      return isNaN(d.getTime()) ? v : d.toISOString()
    }
    return v
  }

  const isStale =
    entry.published_data != null &&
    fields.some(
      (f) =>
        f.name in entry.published_data! &&
        JSON.stringify(normalize(entry[f.name], f.type)) !==
          JSON.stringify(normalize(entry.published_data![f.name], f.type)),
    )

  if (isStale) return <Badge variant="secondary">Published*</Badge>
  return <Badge variant="default">Published</Badge>
}
