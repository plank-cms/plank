import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  FileTextIcon,
  ImageIcon,
  CheckIcon,
  Settings2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  FileIcon,
  CalendarClockIcon,
} from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { useSettings } from '@/context/settings.tsx'
import { useAuth } from '@/context/auth.tsx'
import { formatDate, formatDatetime } from '@/lib/formatDate.ts'
import { Button } from '@/components/ui/button.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { UserAvatar } from '@/components/ui/custom/UserAvatar.tsx'
import { PaginationWrap } from '@/components/ui/custom/PaginationWrap.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip.tsx'
import HeaderFixed from '@/components/Header'

// Types

type FieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'media'
  | 'relation'
  | 'uid'

type FieldDef = { name: string; type: FieldType }

type ContentType = { name: string; slug: string; fields: FieldDef[] }

type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'scheduled' | 'published'
  published_data: Record<string, unknown> | null
  published_at: string | null
  scheduled_for: string | null
  created_at: string
  updated_at: string
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}

type EntriesResponse = { data: Entry[]; total: number; page: number; limit: number }

type ColSort = { field: string; dir: 'asc' | 'desc' }
type ViewConfig = { visibleFields: string[]; sort: ColSort }

// Helpers

const DEFAULT_VISIBLE = 4
const DEFAULT_SORT: ColSort = { field: 'created_at', dir: 'desc' }

const SYSTEM_SORT_OPTIONS = [
  { name: 'created_at', label: 'Created' },
  { name: 'updated_at', label: 'Updated' },
  { name: 'published_at', label: 'Published' },
]

function humanize(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function defaultViewConfig(allFields: FieldDef[]): ViewConfig {
  return {
    visibleFields: allFields.slice(0, DEFAULT_VISIBLE).map((f) => f.name),
    sort: DEFAULT_SORT,
  }
}

function parseViewConfig(saved: Partial<ViewConfig> | null, allFields: FieldDef[]): ViewConfig {
  if (!saved) return defaultViewConfig(allFields)
  const visible = (saved.visibleFields ?? []).filter((n) => allFields.some((f) => f.name === n))
  return {
    visibleFields:
      visible.length > 0 ? visible : allFields.slice(0, DEFAULT_VISIBLE).map((f) => f.name),
    sort: saved.sort ?? DEFAULT_SORT,
  }
}

async function fetchViewConfig(slug: string): Promise<Partial<ViewConfig> | null> {
  const token = localStorage.getItem('plank_token')
  const res = await fetch(`/cms/admin/users/me/prefs/view_${slug}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  const { value } = (await res.json()) as { value: Partial<ViewConfig> | null }
  return value
}

async function persistViewConfig(slug: string, config: ViewConfig): Promise<void> {
  const token = localStorage.getItem('plank_token')
  await fetch(`/cms/admin/users/me/prefs/view_${slug}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ value: config }),
  })
}

// MediaThumbnail

function MediaThumbnail({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (value.startsWith('http')) {
      setUrl(value)
      return
    }
    const token = localStorage.getItem('plank_token')
    fetch(`/cms/admin/media/${value}/url`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ url: string }>) : null))
      .then((data) => setUrl(data?.url ?? null))
      .catch(() => {})
  }, [value])

  if (!url) {
    return <ImageIcon className="size-4 text-muted-foreground" />
  }

  const isImage = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
  if (isImage) {
    return <img src={url} alt="" className="size-8 object-cover" />
  }

  return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <FileIcon className="size-3.5 shrink-0" />
      <span className="truncate max-w-30">File</span>
    </span>
  )
}

// FieldCell

function FieldCell({ field, value }: { field: FieldDef; value: unknown }) {
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

  if (field.type === 'text' || field.type === 'richtext') {
    const text = String(value)
    return (
      <span className="text-muted-foreground truncate max-w-50 block">
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
          ? 'font-mono text-xs text-muted-foreground truncate max-w-40 block'
          : 'font-medium truncate max-w-50 block'
      }
    >
      {text.length > 60 ? text.slice(0, 60) + '…' : text}
    </span>
  )
}

// AuthorAvatar

function AuthorAvatar({ entry }: { entry: Entry }) {
  const first = entry._author_first_name
  const last = entry._author_last_name
  const label = first || last ? [first, last].filter(Boolean).join(' ') : null

  const avatar = (
    <UserAvatar
      avatarUrl={entry._author_avatar_url}
      firstName={first}
      lastName={last}
      className="size-7"
      fallbackClassName="text-[10px]"
    />
  )

  if (!label) return avatar

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// StatusBadge

function StatusBadge({ entry, fields }: { entry: Entry; fields: FieldDef[] }) {
  const { timezone } = useSettings()

  if (entry.status === 'scheduled') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-600">
        <CalendarClockIcon className="size-3 mr-1" />
        {entry.scheduled_for ? formatDate(entry.scheduled_for, timezone) : 'Scheduled'}
      </Badge>
    )
  }

  if (entry.status === 'draft') return <Badge variant="outline">Draft</Badge>

  const normalize = (v: unknown, type: string) => {
    if (type === 'datetime' && v && typeof v === 'string') {
      const d = new Date(v)
      return isNaN(d.getTime()) ? v : d.toISOString()
    }
    return v
  }
  const isStale =
    entry.published_data != null &&
    fields.some(
      (f) =>
        JSON.stringify(normalize(entry[f.name], f.type)) !==
        JSON.stringify(normalize(entry.published_data![f.name], f.type)),
    )
  return <Badge variant={isStale ? 'secondary' : 'default'}>Published</Badge>
}

// ConfigureViewDialog

function ConfigureViewDialog({
  open,
  onOpenChange,
  allFields,
  config,
  onApply,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allFields: FieldDef[]
  config: ViewConfig
  onApply: (cfg: ViewConfig) => void
}) {
  const [visible, setVisible] = useState<string[]>(config.visibleFields)
  const [sort, setSort] = useState<ColSort>(config.sort)

  useEffect(() => {
    if (open) {
      setVisible(config.visibleFields)
      setSort(config.sort)
    }
  }, [open, config])

  const hidden = allFields.filter((f) => !visible.includes(f.name))

  function move(name: string, dir: -1 | 1) {
    setVisible((prev) => {
      const idx = prev.indexOf(name)
      if (idx === -1) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function add(name: string) {
    setVisible((prev) => [...prev, name])
  }

  function remove(name: string) {
    setVisible((prev) => prev.filter((n) => n !== name))
  }

  const sortOptions = [
    ...SYSTEM_SORT_OPTIONS,
    ...allFields
      .filter((f) => !['media', 'text', 'richtext', 'relation'].includes(f.type))
      .map((f) => ({ name: f.name, label: humanize(f.name) })),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[80vh] flex flex-col">
        <DialogHeader className="flex-none">
          <DialogTitle>Configure the view</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-5 py-1">
          {/* Displayed fields */}
          <div className="flex-none">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Displayed fields
            </p>
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No fields selected.</p>
            ) : (
              <ul className="space-y-1">
                {visible.map((name, idx) => {
                  const field = allFields.find((f) => f.name === name)
                  return (
                    <li
                      key={name}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex-1 font-medium">{humanize(name)}</span>
                      {field && <span className="text-xs text-muted-foreground">{field.type}</span>}
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => move(name, -1)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === visible.length - 1}
                        onClick={() => move(name, 1)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(name)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <MinusCircleIcon className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Available fields */}
          {hidden.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide flex-none">
                Available fields
              </p>
              <ul className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {hidden.map((field) => (
                  <li
                    key={field.name}
                    className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <span className="flex-1">{humanize(field.name)}</span>
                    <span className="text-xs">{field.type}</span>
                    <button
                      type="button"
                      onClick={() => add(field.name)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <PlusCircleIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sort */}
          <div className="flex-none">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sort entries
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={sort.field}
                onValueChange={(v) => setSort((s) => ({ ...s, field: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort.dir}
                onValueChange={(v) => setSort((s) => ({ ...s, dir: v as 'asc' | 'desc' }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-none">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply({ visibleFields: visible, sort })
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// EntriesList

export function EntriesList() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { timezone } = useSettings()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [viewConfig, setViewConfig] = useState<ViewConfig | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const { loading: deleting, request: requestDelete } = useApi()

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null,
  )

  useEffect(() => {
    if (!ct || !slug) return
    fetchViewConfig(slug)
      .then((saved) => setViewConfig(parseViewConfig(saved, ct.fields)))
      .catch(() => setViewConfig(defaultViewConfig(ct.fields)))
  }, [ct?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelected(new Set())
  }, [page, limit])

  const config = viewConfig ?? {
    visibleFields: ct?.fields.slice(0, DEFAULT_VISIBLE).map((f) => f.name) ?? [],
    sort: DEFAULT_SORT,
  }
  const { sort } = config

  const {
    data: entries,
    loading: loadingEntries,
    refetch,
  } = useFetch<EntriesResponse>(
    slug && viewConfig
      ? `/cms/admin/content-types/${slug}/entries?page=${page}&limit=${limit}&sort=${sort.field}&order=${sort.dir}`
      : null,
  )

  async function handleDelete() {
    if (!deletingId || !slug) return
    await requestDelete(`/cms/admin/entries/${slug}/${deletingId}`, 'DELETE')
    setDeletingId(null)
    refetch()
  }
  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canDeleteEntries = permissions.includes('*') || permissions.includes('entries:delete')

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
      const token = localStorage.getItem('plank_token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}/status`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'draft' }),
          }),
        ),
      )
      setSelected(new Set())
      refetch()
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkDelete() {
    if (!slug || bulkLoading) return
    setBulkLoading(true)
    try {
      const token = localStorage.getItem('plank_token')
      const headers: HeadersInit = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}`, { method: 'DELETE', headers }),
        ),
      )
      setBulkConfirmDelete(false)
      setSelected(new Set())
      refetch()
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

  const visibleFields = config.visibleFields
    .map((name) => ct.fields.find((f) => f.name === name))
    .filter(Boolean) as FieldDef[]

  const totalPages = Math.ceil((entries?.total ?? 0) / (entries?.limit ?? 20))

  return (
    <>
      <HeaderFixed>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold -mt-6">{ct.name}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfigOpen(true)} className="gap-1.5">
              <Settings2Icon className="size-3.5" />
              Configure the view
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
        {loadingEntries && (
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Spinner className="size-4" />
            <span className="text-sm">Loading entries…</span>
          </div>
        )}

        {!loadingEntries && (entries?.data ?? []).length === 0 && (
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

        {!loadingEntries && (entries?.data ?? []).length > 0 && (
          <TooltipProvider>
            {selected.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading}
                    onClick={handleBulkUnpublish}
                  >
                    {bulkLoading ? <Spinner className="size-3.5" /> : null}
                    Unpublish
                  </Button>
                  {canDeleteEntries && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={bulkLoading}
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
              <table className="w-full text-sm">
                <thead className="border-b border-border font-bold uppercase">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    {visibleFields.map((field) => (
                      <th
                        key={field.name}
                        className="px-4 py-3 text-left font-medium text-muted-foreground"
                      >
                        {humanize(field.name)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Updated
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Pub / Sch
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Author
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(entries?.data ?? []).map((entry) => (
                    <tr
                      key={entry.id}
                      className={`group transition-colors ${selected.has(entry.id) ? 'bg-muted/40' : 'hover:bg-muted/30'}`}
                    >
                      <td className="w-10 px-4 py-3">
                        <Checkbox
                          checked={selected.has(entry.id)}
                          onCheckedChange={() => toggleOne(entry.id)}
                          aria-label="Select row"
                        />
                      </td>
                      {visibleFields.map((field) => (
                        <td key={field.name} className="px-4 py-3">
                          <FieldCell field={field} value={entry[field.name]} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.created_at, timezone)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.updated_at, timezone)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {entry.status === 'scheduled' && entry.scheduled_for
                          ? formatDate(entry.scheduled_for, timezone)
                          : entry.published_at
                            ? formatDate(entry.published_at, timezone)
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge entry={entry} fields={ct.fields} />
                      </td>
                      <td className="px-4 py-3">
                        <AuthorAvatar entry={entry} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/content/${slug}/${entry.id}`)}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                          {canDeleteEntries && (
                            <button
                              type="button"
                              onClick={() => setDeletingId(entry.id)}
                              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2Icon className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
