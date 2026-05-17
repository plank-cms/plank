import type { ReactNode } from 'react'
import { formatDate } from '@/shared/lib/formatDate.ts'
import { Badge } from '@/shared/ui/badge.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table.tsx'
import { AuthorCell } from './AuthorCell.tsx'
import type { ContentType, EntryFieldMap, RecentEntry } from '../types.ts'

type EntriesTableProps = {
  title: string
  dateLabel: string
  emptyMessage: string
  entries: RecentEntry[]
  loading: boolean
  timezone: string
  navigate: (to: string) => void
  collectionTypes: ContentType[]
  entryFieldMap: EntryFieldMap
  guessDefaultField: (ct: ContentType) => string
  toEntryLabel: (value: unknown) => string
  getDateValue: (entry: RecentEntry) => string | null
  action?: ReactNode
}

export function EntriesTable({
  title,
  dateLabel,
  emptyMessage,
  entries,
  loading,
  timezone,
  navigate,
  collectionTypes,
  entryFieldMap,
  guessDefaultField,
  toEntryLabel,
  getDateValue,
  action,
}: EntriesTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <Table className="w-full text-sm">
        <TableHeader className="border-b border-border font-bold uppercase">
          <TableRow className="hover:bg-transparent">
            <TableHead colSpan={4} className="h-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                {action}
              </div>
            </TableHead>
          </TableRow>
          <TableRow className="border-t border-border hover:bg-transparent">
            <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
              Entry
            </TableHead>
            <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
              Collection Type
            </TableHead>
            <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
              Author
            </TableHead>
            <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
              {dateLabel}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="border-b">
              <TableCell colSpan={4} className="h-24">
                <Spinner className="mx-auto size-5" />
              </TableCell>
            </TableRow>
          ) : entries.length === 0 ? (
            <TableRow className="border-b">
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow
                key={`${entry.slug}-${entry.id}`}
                className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
              >
                <TableCell className="px-4 py-3 align-middle">
                  <button
                    type="button"
                    onClick={() => navigate(`/content/${entry.slug}/${entry.id}`)}
                    className="text-left hover:underline"
                  >
                    <div className="font-medium">
                      {toEntryLabel(
                        entry[
                          entryFieldMap[entry.slug] ??
                            guessDefaultField(
                              collectionTypes.find((ct) => ct.slug === entry.slug) ?? {
                                slug: entry.slug,
                                name: entry.contentTypeName,
                                kind: 'collection',
                                isDefault: false,
                                fields: [],
                              },
                            )
                        ],
                      )}
                    </div>
                  </button>
                </TableCell>
                <TableCell className="px-4 py-3 align-middle">
                  <Badge variant="outline">{entry.contentTypeName}</Badge>
                </TableCell>
                <TableCell className="px-4 py-3 align-middle">
                  <AuthorCell entry={entry} />
                </TableCell>
                <TableCell className="px-4 py-3 align-middle">
                  {getDateValue(entry) ? formatDate(getDateValue(entry), timezone) : '—'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
