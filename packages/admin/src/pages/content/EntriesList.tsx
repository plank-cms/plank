import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PlusIcon, PencilIcon, Trash2Icon, FileTextIcon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.tsx'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty.tsx'

type ContentType = {
  name: string
  slug: string
  fields: { name: string; type: string }[]
}

type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'published'
  published_data: Record<string, unknown> | null
  published_at: string | null
  created_at: string
  updated_at: string
}

type EntriesResponse = {
  data: Entry[]
  total: number
  page: number
  limit: number
}

function StatusBadge({ entry, fields }: { entry: Entry; fields: { name: string }[] }) {
  if (entry.status === 'draft') {
    return <Badge variant="outline">Draft</Badge>
  }
  const isStale = entry.published_data != null && fields.some(
    (f) => JSON.stringify(entry[f.name]) !== JSON.stringify(entry.published_data![f.name])
  )
  return <Badge variant={isStale ? 'secondary' : 'default'}>Published</Badge>
}

export function EntriesList() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { loading: deleting, request: requestDelete } = useApi()

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null
  )
  const { data: entries, loading: loadingEntries, refetch } = useFetch<EntriesResponse>(
    slug ? `/cms/admin/content-types/${slug}/entries?page=${page}&limit=20` : null
  )

  async function handleDelete() {
    if (!deletingId || !slug) return
    await requestDelete(`/cms/admin/entries/${slug}/${deletingId}`, 'DELETE')
    setDeletingId(null)
    refetch()
  }

  if (loadingCt) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!ct) return null

  const fieldNames = new Set(ct.fields.map((f) => f.name))
  const hasTitle = fieldNames.has('title')
  const hasSlug = fieldNames.has('slug')

  const totalPages = Math.ceil((entries?.total ?? 0) / (entries?.limit ?? 20))

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{ct.name}</h1>
        <Button onClick={() => navigate(`/content/${slug}/new`)} className="gap-2">
          <PlusIcon className="size-4" />
          New entry
        </Button>
      </div>

      {loadingEntries && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Spinner className="size-4" />
          <span className="text-sm">Loading entries…</span>
        </div>
      )}

      {!loadingEntries && (entries?.data ?? []).length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia>
            <EmptyTitle>No entries yet</EmptyTitle>
            <EmptyDescription>Create your first entry for {ct.name}.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate(`/content/${slug}/new`)}>New entry</Button>
          </EmptyContent>
        </Empty>
      )}

      {!loadingEntries && (entries?.data ?? []).length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {hasTitle && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>}
                  {hasSlug && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>}
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Published at</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(entries?.data ?? []).map((entry) => (
                  <tr key={entry.id} className="group hover:bg-muted/30 transition-colors">
                    {hasTitle && (
                      <td className="px-4 py-3 font-bold">
                        {entry.title ? String(entry.title) : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                    )}
                    {hasSlug && (
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {entry.slug ? String(entry.slug) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.published_at
                        ? new Date(entry.published_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge entry={entry} fields={ct.fields} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => navigate(`/content/${slug}/${entry.id}`)}
                          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(entry.id)}
                          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{entries?.total} entries</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(deletingId)} onOpenChange={(v) => { if (!v) setDeletingId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Spinner className="size-4" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
