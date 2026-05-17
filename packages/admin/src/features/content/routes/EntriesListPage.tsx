import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  PlusIcon,
  PencilIcon,
  EyeIcon,
  Trash2Icon,
  FileTextIcon,
  Settings2Icon,
  SearchIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useApi } from '@/shared/hooks/useApi.ts'
import { useSettings } from '@/shared/context/settings.tsx'
import { useAuth } from '@/shared/context/auth.tsx'
import { formatDate } from '@/shared/lib/formatDate.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog.tsx'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/shared/ui/empty.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import { PaginationWrap } from '@/shared/ui/custom/PaginationWrap.tsx'
import { Checkbox } from '@/shared/ui/checkbox.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { TooltipProvider } from '@/shared/ui/tooltip.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table.tsx'
import HeaderFixed from '@/shared/components/Header'
import type { AdminAddonsRegistryResponse } from '@/shared/lib/addons.ts'
import {
  DEFAULT_SORT,
  DEFAULT_VISIBLE,
  fetchViewConfig,
  getStaleDraftAgeDays,
  humanize,
  isMissingMediaValue,
  isMissingTextValue,
  parseContentHealthSettings,
  parseViewConfig,
  persistViewConfig,
  STATUS_LABELS,
  STATUS_ORDER,
  SYSTEM_COL_DEFS,
} from './lib/entriesList.ts'
import type {
  ContentType,
  Entry,
  EntriesResponse,
  EntryStatus,
  FieldDef,
  ViewConfig,
} from './types.ts'
import { AuthorAvatar } from './components/AuthorAvatar.tsx'
import { ConfigureViewDialog } from './components/ConfigureViewDialog.tsx'
import { EntryHealthIndicator } from './components/EntryHealthIndicator.tsx'
import { FieldCell } from './components/FieldCell.tsx'
import { StatusBadge } from './components/StatusBadge.tsx'

// EntriesList

export function EntriesList() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { timezone } = useSettings()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const rawStatusFilter = searchParams.get('status')
  const statusFilter: EntryStatus | '' =
    rawStatusFilter &&
    ['draft', 'scheduled', 'published', 'pending', 'in_review'].includes(rawStatusFilter)
      ? (rawStatusFilter as EntryStatus)
      : ''
  const limit = [10, 30, 50, 70, 100].includes(Number(searchParams.get('limit')))
    ? Number(searchParams.get('limit'))
    : 10

  function setPage(p: number) {
    setSearchParams(
      (prev) => {
        prev.set('page', String(p))
        return prev
      },
      { replace: true },
    )
  }
  function setLimit(l: number) {
    setSearchParams(
      (prev) => {
        prev.set('limit', String(l))
        prev.set('page', '1')
        return prev
      },
      { replace: true },
    )
  }
  function setStatusFilter(value: EntryStatus | '') {
    setSearchParams(
      (prev) => {
        if (value) prev.set('status', value)
        else prev.delete('status')
        prev.set('page', '1')
        return prev
      },
      { replace: true },
    )
  }
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [viewConfig, setViewConfig] = useState<ViewConfig | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const { loading: deleting, request: requestDelete } = useApi()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null,
  )
  const { data: addonsRegistry } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')
  const contentHealthAddon = addonsRegistry?.addons.find((addon) => addon.id === 'content-health') ?? null
  const contentHealthActive = Boolean(
    contentHealthAddon?.installed && contentHealthAddon.enabled && contentHealthAddon.compatible,
  )
  const { data: contentHealthSettings } = useFetch<Record<string, string>>(
    contentHealthActive ? '/cms/admin/addons/content-health/settings' : null,
  )

  useEffect(() => {
    if (!ct || !slug) return
    fetchViewConfig(slug)
      .then((saved) => setViewConfig(parseViewConfig(saved, ct.fields)))
      .catch(() => setViewConfig(defaultViewConfig(ct.fields)))
  }, [ct?.slug])

  useEffect(() => {
    setSelected(new Set())
  }, [page, limit])

  const config = viewConfig ?? {
    visibleFields: ct?.fields.slice(0, DEFAULT_VISIBLE).map((f) => f.name) ?? [],
    visibleSystemCols: SYSTEM_COL_DEFS.map((c) => c.name),
    sort: DEFAULT_SORT,
  }
  const { sort } = config
  const parsedContentHealthSettings = parseContentHealthSettings(contentHealthSettings)
  const contentHealthConfig = slug
    ? parsedContentHealthSettings?.contentTypes.find(
        (contentType) => contentType.slug === slug && contentType.enabled,
      ) ?? null
    : null

  // columns: derived from config.visibleFields — support relation.field notation
  type Column = { field: FieldDef; displayField?: string }
  const columns: Column[] = (config.visibleFields ?? [])
    .map((v) => {
      const parts = String(v).split('.')
      const base = parts[0]
      const sub = parts[1]
      const f = ct?.fields.find((ff) => ff.name === base)
      return f ? { field: f, displayField: sub } : null
    })
    .filter(Boolean) as Column[]

  const searchableFields = (ct?.fields ?? [])
    .filter((f) => ['string', 'uid', 'text', 'richtext'].includes(f.type))
    .map((f) => f.name)

  const {
    data: entries,
    loading: loadingEntries,
    refetch,
  } = useFetch<EntriesResponse>(
    slug && viewConfig
      ? `/cms/admin/content-types/${slug}/entries?page=${page}&limit=${limit}&sort=${sort.field}&order=${sort.dir}${statusFilter ? `&status=${statusFilter}` : ''}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}&searchFields=${searchableFields.join(',')}` : ''}`
      : null,
  )

  const availableStatusOptions = [
    ...new Set([...(entries?.available_statuses ?? []), ...(statusFilter ? [statusFilter] : [])]),
  ].filter((status): status is EntryStatus =>
    ['draft', 'scheduled', 'published', 'pending', 'in_review'].includes(status),
  ).sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))

  async function handleDelete() {
    if (!deletingId || !slug) return
    try {
      await requestDelete(`/cms/admin/entries/${slug}/${deletingId}`, 'DELETE')
      toast.success('Entry deleted')
    } catch {
      toast.error('Could not delete entry')
    }
    setDeletingId(null)
    refetch()
  }
  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canDeleteEntries = permissions.includes('*') || permissions.includes('entries:delete')
  const isViewerRole = user?.role?.toLowerCase() === 'viewer'
  const isContributorRole = user?.role?.toLowerCase() === 'contributor'
  const isEditorRole = user?.role?.toLowerCase() === 'editor'
  const isOwnershipRestrictedDeleteRole = isContributorRole || isEditorRole
  const isOwnEntry = (entry: Entry) => String(entry.created_by ?? '') === String(user?.id ?? '')
  const isReviewDisabledForRole = (_entry: Entry) => false
  const canEditEntry = (entry: Entry) =>
    canWriteEntries && (!isContributorRole || isOwnEntry(entry)) && !isReviewDisabledForRole(entry)
  const canDeleteEntry = (entry: Entry) =>
    canDeleteEntries && (!isOwnershipRestrictedDeleteRole || isOwnEntry(entry))
  const editableSelectedIds = [...selected].filter((id) => {
    const entry = (entries?.data ?? []).find((e) => e.id === id)
    return entry ? canEditEntry(entry) : false
  })
  const deletableSelectedIds = [...selected].filter((id) => {
    const entry = (entries?.data ?? []).find((e) => e.id === id)
    return entry ? canDeleteEntry(entry) : false
  })

  const currentIds = (entries?.data ?? []).map((e) => e.id)
  const allSelected = currentIds.length > 0 && currentIds.every((id) => selected.has(id))
  const someSelected = !allSelected && currentIds.some((id) => selected.has(id))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) currentIds.forEach((id) => next.delete(id))
      else currentIds.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkUnpublish() {
    if (!slug || bulkLoading) return
    setBulkLoading(true)
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      await Promise.all(
        editableSelectedIds.map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}/status`, {
            method: 'PATCH',
            credentials: 'include',
            headers,
            body: JSON.stringify({ status: 'draft' }),
          }),
        ),
      )
      toast.success('Entries unpublished')
      setSelected(new Set())
      refetch()
    } catch {
      toast.error('Could not unpublish entries')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkDelete() {
    if (!slug || bulkLoading) return
    setBulkLoading(true)
    try {
      await Promise.all(
        deletableSelectedIds.map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}`, { method: 'DELETE', credentials: 'include' }),
        ),
      )
      toast.success('Entries deleted')
      setBulkConfirmDelete(false)
      setSelected(new Set())
      refetch()
    } catch {
      toast.error('Could not delete entries')
    } finally {
      setBulkLoading(false)
    }
  }

  function handleApplyConfig(cfg: ViewConfig) {
    setViewConfig(cfg)
    if (slug) persistViewConfig(slug, cfg).catch(() => {})
    setPage(1)
  }

  if (loadingCt || !viewConfig) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!ct) return null

  const totalPages = Math.ceil((entries?.total ?? 0) / (entries?.limit ?? 20))

  return (
    <>
      <HeaderFixed>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold -mt-6">{ct.name}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfigOpen(true)} className="gap-1.5">
              <Settings2Icon className="size-3.5" />
              View config
            </Button>
            {canWriteEntries && (
              <Button onClick={() => navigate(`/content/${slug}/new`)} className="gap-2">
                <PlusIcon className="size-4" />
                New entry
              </Button>
            )}
          </div>
        </div>
      </HeaderFixed>

      <section className="mt-24">
        <div className="mb-3 flex items-center gap-3">
          <Select
            value={statusFilter || 'all'}
            onValueChange={(value) => setStatusFilter(value === 'all' ? '' : (value as EntryStatus))}
          >
            <SelectTrigger className="h-10 min-h-10 max-h-10 w-38">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {availableStatusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-52">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search entries…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {!loadingEntries && entries != null && (
            <span className="text-muted-foreground text-sm">
              {(entries?.data ?? []).length} / {entries.total}{' '}
              {entries.total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {loadingEntries && (
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Spinner className="size-4" />
            <span className="text-sm">Loading entries…</span>
          </div>
        )}

        {!loadingEntries && (entries?.data ?? []).length === 0 && !debouncedSearch && !statusFilter && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No entries yet</EmptyTitle>
              <EmptyDescription>Create your first entry for {ct.name}.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {canWriteEntries && (
                <Button onClick={() => navigate(`/content/${slug}/new`)}>New entry</Button>
              )}
            </EmptyContent>
          </Empty>
        )}

        {!loadingEntries &&
          (entries?.data ?? []).length === 0 &&
          (debouncedSearch || statusFilter) && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No results</EmptyTitle>
              <EmptyDescription>
                {debouncedSearch && statusFilter
                  ? `No entries match "${debouncedSearch}" with status "${STATUS_LABELS[statusFilter]}".`
                  : debouncedSearch
                    ? `No entries match "${debouncedSearch}".`
                    : `No entries with status "${STATUS_LABELS[statusFilter]}".`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!loadingEntries && (entries?.data ?? []).length > 0 && (
          <TooltipProvider>
            {!isViewerRole && selected.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading || editableSelectedIds.length === 0}
                    onClick={handleBulkUnpublish}
                  >
                    {bulkLoading ? <Spinner className="size-3.5" /> : null}
                    Unpublish
                  </Button>
                  {canDeleteEntries && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={bulkLoading || deletableSelectedIds.length === 0}
                      onClick={() => setBulkConfirmDelete(true)}
                    >
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border">
              <Table className="w-full">
                <TableHeader className="border-b border-border font-bold uppercase">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 px-4 py-3">
                      {!isViewerRole && (
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                          aria-label="Select all"
                        />
                      )}
                    </TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col.field.name}
                        className="px-4 py-3 text-left font-medium text-muted-foreground"
                      >
                        {humanize(col.field.name)}
                      </TableHead>
                    ))}
                    {config.visibleSystemCols.includes('created_at') && (
                      <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Created
                      </TableHead>
                    )}
                    {config.visibleSystemCols.includes('updated_at') && (
                      <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Updated
                      </TableHead>
                    )}
                    {config.visibleSystemCols.includes('pub_sch') && (
                      <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Published
                      </TableHead>
                    )}
                    <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="w-10 px-4 py-3" />
                    <TableHead className="w-28 px-4 py-3" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {(entries?.data ?? []).map((entry) => (
                    <TableRow
                      key={entry.id}
                      className={`group transition-colors ${selected.has(entry.id) ? 'bg-muted/40' : 'hover:bg-muted/30'} ${isContributorRole && !isOwnEntry(entry) ? 'opacity-60' : ''} ${isReviewDisabledForRole(entry) ? 'opacity-60' : ''}`}
                    >
                      <TableCell className="w-10 px-4 py-3">
                        {!isViewerRole && (
                          <Checkbox
                            checked={selected.has(entry.id)}
                            onCheckedChange={() => toggleOne(entry.id)}
                            aria-label="Select row"
                          />
                        )}
                      </TableCell>
                      {columns.map((col) => {
                        const rawValue = entry[col.field.name]
                        let value: unknown = rawValue

                        if (col.field.type === 'relation') {
                          value = rawValue
                        } else if (col.displayField) {
                          if (rawValue && typeof rawValue === 'object') {
                            value = (rawValue as Record<string, unknown>)[col.displayField]
                          } else {
                            value =
                              rawValue && typeof rawValue === 'object'
                                ? (rawValue as Record<string, unknown>).title
                                : rawValue
                          }
                        }

                        return (
                          <TableCell key={col.field.name} className="px-4 py-3">
                            <FieldCell
                              field={col.field}
                              value={value}
                              displayField={col.displayField}
                            />
                          </TableCell>
                        )
                      })}
                      {config.visibleSystemCols.includes('created_at') && (
                        <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.created_at, timezone)}
                        </TableCell>
                      )}
                      {config.visibleSystemCols.includes('updated_at') && (
                        <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.updated_at, timezone)}
                        </TableCell>
                      )}
                      {config.visibleSystemCols.includes('pub_sch') && (
                        <TableCell className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {entry.status === 'scheduled' && entry.scheduled_for
                            ? formatDate(entry.scheduled_for, timezone)
                            : entry.published_at
                              ? formatDate(entry.published_at, timezone)
                              : '—'}
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-3">
                        {(() => {
                          const staleDays =
                            contentHealthActive &&
                            contentHealthConfig?.checkStaleDrafts &&
                            entry.status === 'draft'
                              ? getStaleDraftAgeDays(entry.updated_at)
                              : 0
                          const isStaleDraft =
                            Boolean(contentHealthConfig?.checkStaleDrafts)
                            && entry.status === 'draft'
                            && staleDays >= (parsedContentHealthSettings?.staleDraftDays ?? 30)

                          return (
                            <StatusBadge entry={entry} fields={ct.fields} isStaleDraft={isStaleDraft} />
                          )
                        })()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {(() => {
                          const missingTextFields =
                            contentHealthConfig?.requiredTextFields?.filter((fieldName) =>
                              isMissingTextValue(entry[fieldName]),
                            ) ?? []
                          const missingMediaFields =
                            contentHealthConfig?.requiredMediaFields?.filter((fieldName) =>
                              isMissingMediaValue(entry[fieldName]),
                            ) ?? []
                          const issueMessages = [
                            ...(missingTextFields.length > 0
                              ? [`Missing text: ${missingTextFields.map(humanize).join(', ')}`]
                              : []),
                            ...(missingMediaFields.length > 0
                              ? [`Missing media: ${missingMediaFields.map(humanize).join(', ')}`]
                              : []),
                          ]
                          const hasContentHealthIssues = issueMessages.length > 0

                          if (!contentHealthActive || !contentHealthConfig) return null

                          return (
                            <EntryHealthIndicator
                              hasIssues={hasContentHealthIssues}
                              title={
                                issueMessages.length > 0
                                  ? `Content health indicator · ${issueMessages.join(' · ')}`
                                  : 'Content health indicator · All configured text and media checks passed'
                              }
                            />
                          )
                        })()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <AuthorAvatar entry={entry} />
                          {isViewerRole ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => navigate(`/content/${slug}/${entry.id}`)}
                              className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            >
                              <EyeIcon className="size-3.5" />
                            </Button>
                          ) : (
                            <>
                              {canEditEntry(entry) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => navigate(`/content/${slug}/${entry.id}`)}
                                  className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                >
                                  <PencilIcon className="size-3.5" />
                                </Button>
                              )}
                              {canDeleteEntry(entry) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeletingId(entry.id)}
                                  className="flex size-8 items-center justify-center rounded text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2Icon className="size-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <PaginationWrap
                page={page}
                totalPages={totalPages}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </div>
          </TooltipProvider>
        )}

        {/* Configure view dialog */}
        {viewConfig && (
          <ConfigureViewDialog
            open={configOpen}
            onOpenChange={setConfigOpen}
            allFields={ct.fields}
            config={viewConfig}
            onApply={handleApplyConfig}
          />
        )}

        {/* Delete dialog */}
        <Dialog
          open={Boolean(deletingId)}
          onOpenChange={(v) => {
            if (!v) setDeletingId(null)
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete entry?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingId(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Spinner className="size-4" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk delete dialog */}
        <Dialog
          open={bulkConfirmDelete}
          onOpenChange={(v) => {
            if (!v) setBulkConfirmDelete(false)
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Delete {selected.size} {selected.size === 1 ? 'entry' : 'entries'}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading}>
                {bulkLoading ? <Spinner className="size-4" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </>
  )
}
