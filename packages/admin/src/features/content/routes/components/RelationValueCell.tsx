import { useEffect, useState } from 'react'
import { normalizeRelationIds, pickRelationDisplayField } from '../lib/entriesList.ts'
import type { RelationContentType } from '../types.ts'

type RelationValueCellProps = {
  relatedSlug?: string
  value: unknown
  displayField?: string
}

export function RelationValueCell({
  relatedSlug,
  value,
  displayField,
}: RelationValueCellProps) {
  const [labels, setLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const ids = normalizeRelationIds(value)

  useEffect(() => {
    const nextIds = normalizeRelationIds(value)

    if (!relatedSlug || nextIds.length === 0) {
      setLabels([])
      return
    }

    let cancelled = false
    setLoading(true)

    const resolveDisplayField = displayField
      ? Promise.resolve(displayField)
      : fetch(`/cms/admin/content-types/${relatedSlug}`, { credentials: 'include' })
          .then((r) => (r.ok ? (r.json() as Promise<RelationContentType>) : null))
          .then((ct) => pickRelationDisplayField(ct?.fields ?? []))
          .catch(() => null)

    resolveDisplayField
      .then((resolvedDisplayField) =>
        Promise.all(
          nextIds.map((id) =>
            fetch(`/cms/admin/entries/${relatedSlug}/${id}`, { credentials: 'include' })
              .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
              .then((entry) => {
                if (!entry) return id
                return String(
                  (resolvedDisplayField && entry[resolvedDisplayField]) ??
                    entry.title ??
                    entry.name ??
                    id,
                )
              })
              .catch(() => id),
          ),
        ),
      )
      .then((nextLabels) => {
        if (!cancelled) setLabels(nextLabels.filter(Boolean))
      })
      .catch(() => {
        if (!cancelled) setLabels(nextIds)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [relatedSlug, displayField, value])

  if (ids.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  if (loading && labels.length === 0) {
    return <span className="text-muted-foreground">…</span>
  }

  return <span className="block max-w-50 truncate font-medium">{labels.join(', ')}</span>
}
