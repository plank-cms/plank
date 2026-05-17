import { CalendarClockIcon } from 'lucide-react'
import { Badge } from '@/shared/ui/badge.tsx'
import { formatDatetime } from '@/shared/lib/formatDate.ts'
import type { Entry } from '../entryTypes.ts'

type EntryStatusBadgeProps = {
  status: NonNullable<Entry['status']> | 'draft'
  scheduledFor: string
  timezone: string
  reviewRejected: boolean
  isPublishedStale: boolean
}

export function EntryStatusBadge({
  status,
  scheduledFor,
  timezone,
  reviewRejected,
  isPublishedStale,
}: EntryStatusBadgeProps) {
  if (status === 'scheduled') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-600">
        <CalendarClockIcon className="mr-1 size-3" />
        {scheduledFor ? `Scheduled · ${formatDatetime(scheduledFor, timezone)}` : 'Scheduled'}
      </Badge>
    )
  }

  if (status === 'pending') {
    return reviewRejected ? (
      <Badge variant="destructive">Pending</Badge>
    ) : (
      <Badge className="bg-amber-500 text-black hover:bg-amber-500">Pending</Badge>
    )
  }

  if (status === 'in_review') {
    return <Badge variant="outline">In Review</Badge>
  }

  if (status === 'published') {
    return (
      <Badge variant={isPublishedStale ? 'secondary' : 'default'}>
        {isPublishedStale ? 'Published (pending changes)' : 'Published'}
      </Badge>
    )
  }

  return <Badge variant="secondary">Draft</Badge>
}
