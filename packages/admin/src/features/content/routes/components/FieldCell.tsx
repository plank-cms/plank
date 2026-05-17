import { CheckIcon } from 'lucide-react'
import { useSettings } from '@/shared/context/settings.tsx'
import { formatDatetime } from '@/shared/lib/formatDate.ts'
import type { FieldDef } from '../types.ts'
import { MediaThumbnail } from './MediaThumbnail.tsx'
import { RelationValueCell } from './RelationValueCell.tsx'

type FieldCellProps = {
  field: FieldDef
  value: unknown
  displayField?: string
}

export function FieldCell({ field, value, displayField }: FieldCellProps) {
  const { timezone } = useSettings()

  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>
  }

  if (field.type === 'boolean') {
    return value ? (
      <CheckIcon className="size-4 text-primary" />
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  if (field.type === 'datetime') {
    return <span>{formatDatetime(String(value), timezone)}</span>
  }

  if (field.type === 'number') {
    return <span>{String(value)}</span>
  }

  if (field.type === 'media') {
    return <MediaThumbnail value={String(value)} />
  }

  if (field.type === 'relation') {
    return (
      <RelationValueCell
        relatedSlug={field.relatedSlug}
        value={value}
        displayField={displayField}
      />
    )
  }

  if (field.type === 'text' || field.type === 'richtext') {
    const text = String(value)

    return (
      <span className="block max-w-50 truncate text-muted-foreground">
        {text.length > 60 ? text.slice(0, 60) + '…' : text}
      </span>
    )
  }

  const text = String(value)
  const isUid = field.type === 'uid'

  return (
    <span
      className={
        isUid
          ? 'block max-w-40 truncate font-mono text-xs text-muted-foreground'
          : 'block max-w-50 truncate font-medium'
      }
    >
      {text.length > 60 ? text.slice(0, 60) + '…' : text}
    </span>
  )
}
