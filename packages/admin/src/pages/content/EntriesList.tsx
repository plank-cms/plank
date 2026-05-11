import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  PlusIcon,
  PencilIcon,
  EyeIcon,
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
  SearchIcon,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input.tsx'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
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
  | 'media-gallery'
  | 'relation'
  | 'uid'
  | 'array'
  | 'navigation'

type RelationType = 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'

type FieldDef = {
  name: string
  type: FieldType

  relationType?: RelationType
  relatedSlug?: string
}

type ContentType = { name: string; slug: string; fields: FieldDef[] }

type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  published_data: Record<string, unknown> | null
  published_at: string | null
  scheduled_for: string | null
  review_locked_by_editor?: boolean
  review_rejected?: boolean
  created_at: string
  updated_at: string
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}

type EntryStatus = Entry['status']

type EntriesResponse = {
  data: Entry[]
  total: number
  page: number
  limit: number
  available_statuses?: EntryStatus[]
}

type ColSort = { field: string; dir: 'asc' | 'desc' }
type ViewConfig = { visibleFields: string[]; visibleSystemCols: string[]; sort: ColSort }

// Helpers

const DEFAULT_VISIBLE = 4
const DEFAULT_SORT: ColSort = { field: 'created_at', dir: 'desc' }

const SYSTEM_SORT_OPTIONS = [
  { name: 'created_at', label: 'Created' },
  { name: 'updated_at', label: 'Updated' },
  { name: 'published_at', label: 'Published' },
]

const SYSTEM_COL_DEFS = [
  { name: 'created_at', label: 'Created' },
  { name: 'updated_at', label: 'Updated' },
  { name: 'pub_sch', label: 'Pub / Sch' },
] as const

const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  pending: 'Pending',
  in_review: 'In Review',
}

const STATUS_ORDER: EntryStatus[] = ['draft', 'pending', 'in_review', 'scheduled', 'published']

function humanize(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type RelationCTField = { name: string; type: string }
type RelationContentType = { fields?: RelationCTField[] }

function pickRelationDisplayField(fields: RelationCTField[]) {
  return (
    fields.find((f) => f.name === 'title')?.name ??
    fields.find((f) => f.name === 'name')?.name ??
    fields.find((f) => f.type === 'uid')?.name ??
    fields.find((f) => f.type === 'string')?.name ??
    null
  )
}

function normalizeRelationIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  }

  const id = String(value ?? '').trim()
  return id ? [id] : []
}

function RelationFieldSelector({
  allFields,
  fieldName,
  visible,
  setVisible,
}: {
  allFields: FieldDef[]
  fieldName: string
  visible: string[]
  setVisible: Dispatch<SetStateAction<string[]>>
}) {
  const base = fieldName.split('.')[0]
  const field = allFields.find((f) => f.name === base)
  const relatedSlug = field?.relatedSlug

  const { data: relatedCt } = useFetch<ContentType>(
    relatedSlug ? `/cms/admin/content-types/${relatedSlug}` : null,
  )

  const selected = visible.find((v) => v.split('.')[0] === base)
  const selectedSub = selected && selected.includes('.') ? selected.split('.')[1] : undefined

  function setFieldSub(baseName: string, sub?: string) {
    setVisible((prev) =>
      prev.map((v) => {
        const parts = v.split('.')
        if (parts[0] !== baseName) return v
        return sub ? `${baseName}.${sub}` : baseName
      }),
    )
  }

  useEffect(() => {
    if (!relatedCt?.fields) return
    if (selectedSub) return

    const found = pickRelationDisplayField(relatedCt.fields)

    if (found) {
      setFieldSub(base, found)
    }
  }, [relatedCt, selectedSub, base])

  if (!relatedCt?.fields) return null

  return (
    <Select value={selectedSub} onValueChange={(val) => setFieldSub(base, val)}>
      <SelectTrigger className="h-8 text-sm w-32">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {relatedCt.fields.map((rf) => (
          <SelectItem key={rf.name} value={rf.name}>
            {rf.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RelationValueCell({
  relatedSlug,
  value,
  displayField,
}: {
  relatedSlug?: string
  value: unknown
  displayField?: string
}) {
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

    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    const resolveDisplayField = displayField
      ? Promise.resolve(displayField)
      : fetch(`/cms/admin/content-types/${relatedSlug}`, { headers })
          .then((r) => (r.ok ? (r.json() as Promise<RelationContentType>) : null))
          .then((ct) => pickRelationDisplayField(ct?.fields ?? []))
          .catch(() => null)

    resolveDisplayField
      .then((resolvedDisplayField) =>
        Promise.all(
          nextIds.map((id) =>
            fetch(`/cms/admin/entries/${relatedSlug}/${id}`, { headers })
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

  return <span className="font-medium truncate max-w-50 block">{labels.join(', ')}</span>
}

function defaultViewConfig(allFields: FieldDef[]): ViewConfig {
  return {
    visibleFields: allFields.slice(0, DEFAULT_VISIBLE).map((f) => f.name),
    visibleSystemCols: SYSTEM_COL_DEFS.map((c) => c.name),
    sort: DEFAULT_SORT,
  }
}

function parseViewConfig(saved: Partial<ViewConfig> | null, allFields: FieldDef[]): ViewConfig {
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

function FieldCell({
  field,
  value,
  displayField,
}: {
  field: FieldDef
  value: unknown
  displayField?: string
}) {
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
  if (entry.status === 'pending') {
    if (entry.review_rejected) return <Badge variant="destructive">Pending</Badge>
    return <Badge className="bg-amber-500 text-black hover:bg-amber-500">Pending</Badge>
  }
  if (entry.status === 'in_review') return <Badge variant="outline">In Review</Badge>

  const normalize = (v: unknown, type: string) => {
    if (type === 'datetime' && v && typeof v === 'string') {
      // TIMESTAMP columns (no timezone) serialize to JSONB without TZ indicator;
      // append 'Z' so parsing is stable (UTC) across views.
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
  const [visibleSysCols, setVisibleSysCols] = useState<string[]>(config.visibleSystemCols)
  const [sort, setSort] = useState<ColSort>(config.sort)

  useEffect(() => {
    if (open) {
      setVisible(config.visibleFields)
      setVisibleSysCols(config.visibleSystemCols)
      setSort(config.sort)
    }
  }, [open, config])

  const hidden = allFields.filter((f) => !visible.some((v) => v.split('.')[0] === f.name))

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
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-none">
          <DialogTitle>Configure the view</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-5 py-1">
          <div className={hidden.length > 0 || visibleSysCols.length < SYSTEM_COL_DEFS.length ? 'flex-1 min-h-0 grid gap-5 [grid-template-rows:minmax(7rem,1fr)_minmax(7rem,1fr)]' : 'flex-1 min-h-0 flex flex-col'}>
          {/* Displayed fields */}
          <div className="flex flex-col min-h-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide flex-none">
              Displayed fields
            </p>
            {visible.length === 0 && visibleSysCols.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No fields selected.</p>
            ) : (
              <ul className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {visible.map((name, idx) => {
                  const base = String(name).split('.')[0]
                  const field = allFields.find((f) => f.name === base)
                  return (
                    <li
                      key={name}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex-1 font-medium">{humanize(base)}</span>
                      {field && <span className="text-xs text-muted-foreground">{field.type}</span>}
                      {field && field.type === 'relation' && (
                        <div className="ml-2">
                          <RelationFieldSelector
                            allFields={allFields}
                            fieldName={name}
                            visible={visible}
                            setVisible={setVisible}
                          />
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={idx === 0}
                        onClick={() => move(name, -1)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={idx === visible.length - 1}
                        onClick={() => move(name, 1)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(name)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <MinusCircleIcon className="size-3.5" />
                      </Button>
                    </li>
                  )
                })}
                {visibleSysCols.map((name) => {
                  const col = SYSTEM_COL_DEFS.find((c) => c.name === name)
                  if (!col) return null
                  return (
                    <li
                      key={name}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex-1 font-medium">{col.label}</span>
                      <span className="text-xs text-muted-foreground">system</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled
                        className="flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled
                        className="flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setVisibleSysCols((prev) => prev.filter((n) => n !== name))}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <MinusCircleIcon className="size-3.5" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Available fields */}
          {(hidden.length > 0 || visibleSysCols.length < SYSTEM_COL_DEFS.length) && (
            <div className="flex flex-col min-h-0">
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
                {SYSTEM_COL_DEFS.filter((c) => !visibleSysCols.includes(c.name)).map((col) => (
                  <li
                    key={col.name}
                    className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <span className="flex-1">{col.label}</span>
                    <span className="text-xs">system</span>
                    <button
                      type="button"
                      onClick={() => setVisibleSysCols((prev) => [...prev, col.name])}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <PlusCircleIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>

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
              onApply({ visibleFields: visible, visibleSystemCols: visibleSysCols, sort })
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
      const token = localStorage.getItem('plank_token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      await Promise.all(
        editableSelectedIds.map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}/status`, {
            method: 'PATCH',
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
      const token = localStorage.getItem('plank_token')
      const headers: HeadersInit = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      await Promise.all(
        deletableSelectedIds.map((id) =>
          fetch(`/cms/admin/entries/${slug}/${id}`, { method: 'DELETE', headers }),
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
                        Pub / Sch
                      </TableHead>
                    )}
                    <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Author
                    </TableHead>
                    <TableHead className="px-4 py-3" />
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
                        <StatusBadge entry={entry} fields={ct.fields} />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <AuthorAvatar entry={entry} />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
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
