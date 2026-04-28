import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils.ts'
import { useSettings } from '@/context/settings.tsx'
import { getTimeInTimezone, combineDateAndTime } from '@/lib/formatDate.ts'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Calendar } from '@/components/ui/calendar.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { RichTextEditor, type ImageInsert } from '@/components/ui/custom/RichTextEditor.tsx'
import { uploadMediaFile } from '@/lib/uploadMedia.ts'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx'
import {
  UploadIcon,
  XIcon,
  ImageIcon,
  FolderOpenIcon,
  FolderIcon,
  HomeIcon,
  FileIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

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
type RelationType = 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'
type ArraySubFieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'media'
type ArraySubField = {
  name: string
  type: ArraySubFieldType
  required?: boolean
  subtype?: 'integer' | 'float'
  allowedTypes?: ('image' | 'video' | 'audio' | 'document')[]
  width?: string
}

export type FieldDef = {
  name: string
  type: FieldType
  required?: boolean
  subtype?: 'integer' | 'float'
  relationType?: RelationType
  relatedTable?: string
  relatedSlug?: string
  relatedField?: string
  targetField?: string
  allowedTypes?: ('image' | 'video' | 'audio' | 'document')[]
  width?: string
  arrayFields?: ArraySubField[]
}

type FieldInputProps = {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
  allValues: Record<string, unknown>
  disabled?: boolean
}

const ACCEPT_MAP: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
}

function buildAccept(allowedTypes?: FieldDef['allowedTypes']): string {
  if (!allowedTypes || allowedTypes.length === 0) return '*/*'
  return allowedTypes.map((t) => ACCEPT_MAP[t]).join(',')
}

type MediaItem = {
  id: string
  filename: string
  url: string
  mime_type: string | null
  size: number | null
  alt: string | null
  width: number | null
  height: number | null
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageMime(mime: string | null) {
  return mime?.startsWith('image/') ?? false
}

async function uploadFile(
  file: File,
  folderId?: string | null,
): Promise<{ id: string; url: string }> {
  return uploadMediaFile(file, { folderId })
}

type PickerFolder = { id: string; name: string; parent_id: string | null; item_count: number }
type PickerBreadcrumb = { id: string | null; name: string }

function matchesAllowedTypes(
  mime: string | null,
  allowedTypes?: FieldDef['allowedTypes'],
): boolean {
  if (!allowedTypes || allowedTypes.length === 0) return true
  const m = mime ?? ''
  return allowedTypes.some((t) => {
    if (t === 'image') return m.startsWith('image/')
    if (t === 'video') return m.startsWith('video/')
    if (t === 'audio') return m.startsWith('audio/')
    if (t === 'document') return m.startsWith('application/') || m.startsWith('text/')
    return false
  })
}

function MediaPickerDialog({
  open,
  onOpenChange,
  allowedTypes,
  onSelect,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allowedTypes?: FieldDef['allowedTypes']
  onSelect: (item: MediaItem) => void
}) {
  const [breadcrumb, setBreadcrumb] = useState<PickerBreadcrumb[]>([{ id: null, name: 'Media' }])
  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  const [folders, setFolders] = useState<PickerFolder[]>([])
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const folderParam = currentFolderId ?? ''
    Promise.all([
      fetch(`/cms/admin/folders?parent_id=${folderParam}`, { headers })
        .then((r) => (r.ok ? (r.json() as Promise<{ folders: PickerFolder[] }>) : { folders: [] }))
        .then((d) => d.folders),
      fetch(`/cms/admin/media?folder_id=${folderParam}`, { headers })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: MediaItem[] }>) : { items: [] }))
        .then((d) => d.items),
    ])
      .then(([f, m]) => {
        setFolders(f)
        setItems(m)
      })
      .catch(() => {
        setFolders([])
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [open, currentFolderId])

  // Reset to root when dialog closes
  useEffect(() => {
    if (!open) setBreadcrumb([{ id: null, name: 'Media' }])
  }, [open])

  function openFolder(folder: PickerFolder) {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  function navigateTo(index: number) {
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  const filtered = items.filter((item) => matchesAllowedTypes(item.mime_type, allowedTypes))
  const empty = folders.length === 0 && filtered.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb */}
        {breadcrumb.length > 1 && (
          <div className="flex items-center gap-1 text-sm -mt-1">
            {breadcrumb.map((entry, i) => (
              <span key={i} className="flex items-center gap-1 text-muted-foreground">
                {i > 0 && <span>/</span>}
                {i === breadcrumb.length - 1 ? (
                  <span className="font-medium text-foreground">
                    {i === 0 ? <HomeIcon className="size-3.5" /> : entry.name}
                  </span>
                ) : (
                  <button
                    onClick={() => navigateTo(i)}
                    className="hover:text-foreground transition-colors"
                  >
                    {i === 0 ? <HomeIcon className="size-3.5" /> : entry.name}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-5" />
          </div>
        ) : empty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {items.length === 0 && folders.length === 0
              ? 'No media found.'
              : 'No matching files in this folder.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {folders.length > 0 && (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => openFolder(folder)}
                    className="flex items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/50 hover:border-primary"
                  >
                    <FolderIcon className="size-7 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold leading-tight" title={folder.name}>
                        {folder.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {folder.item_count} {folder.item_count === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {filtered.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item)
                      onOpenChange(false)
                    }}
                    className="group relative overflow-hidden rounded-md border bg-card text-left transition-colors hover:border-primary"
                  >
                    <div className="aspect-square bg-muted">
                      {isImageMime(item.mime_type) ? (
                        <img
                          src={item.url}
                          alt={item.filename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FileIcon className="size-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p
                        className="truncate text-[11px] font-medium leading-tight"
                        title={item.filename}
                      >
                        {item.filename}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatBytes(item.size)}</p>
                    </div>
                    <div className="absolute inset-0 rounded-md ring-2 ring-primary ring-offset-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MediaInput({
  value,
  onChange,
  allowedTypes,
  disabled = false,
}: {
  value: string | null
  onChange: (v: unknown) => void
  allowedTypes?: FieldDef['allowedTypes']
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // value is either null, a legacy URL (starts with http), or a media ID (UUID)
  const isLegacyUrl = typeof value === 'string' && value.startsWith('http')

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    if (isLegacyUrl) {
      setPreviewUrl(value)
      return
    }
    // It's a media ID — fetch a fresh URL
    const token = localStorage.getItem('plank_token')
    fetch(`/cms/admin/media/${value}/url`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ url: string }>) : null))
      .then((data) => setPreviewUrl(data?.url ?? null))
      .catch(() => setPreviewUrl(null))
  }, [value, isLegacyUrl])

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const data = await uploadFile(file)
      setPreviewUrl(data.url)
      onChange(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const isImage = previewUrl && /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(previewUrl)

  if (value) {
    return (
      <div className="relative w-full rounded-md border bg-muted/30 overflow-hidden">
        {previewUrl ? (
          isImage ? (
            <img src={previewUrl} alt="Media" className="max-h-72 w-full object-contain" />
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <ImageIcon className="size-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{previewUrl}</span>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
            <ImageIcon className="size-4 shrink-0" />
            <span className="text-xs">Loading…</span>
          </div>
        )}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute top-1.5 right-1.5 size-6"
          onClick={() => {
            onChange(null)
            setPreviewUrl(null)
          }}
          disabled={disabled}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={buildAccept(allowedTypes)}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (disabled) return
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        className="flex w-full gap-2 rounded-md border border-dashed p-3"
      >
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => inputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <UploadIcon className="size-4" />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => setPickerOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <FolderOpenIcon className="size-4" />
          Library
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={allowedTypes}
        onSelect={(item) => {
          setPreviewUrl(item.url)
          onChange(item.id)
        }}
      />
    </div>
  )
}

function SortableGalleryItem({
  id,
  previewUrl,
  filename,
  onRemove,
  disabled = false,
}: {
  id: string
  previewUrl: string | null
  filename: string
  onRemove: () => void
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square overflow-hidden rounded-md border bg-muted"
    >
      {previewUrl ? (
        <img src={previewUrl} alt={filename} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="size-5 text-muted-foreground" />
        </div>
      )}
      {filename && (
        <div className="absolute bottom-0 left-0 right-0 bg-background/75 backdrop-blur-sm px-1.5 py-1 pointer-events-none">
          <p className="truncate text-[10px] leading-none text-foreground">{filename}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm hover:bg-background"
      >
        <XIcon className="size-3" />
      </button>
      {!disabled && (
      <button
        type="button"
        className="absolute bottom-6 left-1 flex size-5 cursor-grab items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVerticalIcon className="size-3" />
      </button>
      )}
    </div>
  )
}

function MediaGalleryInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string[] | null
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  const ids = Array.isArray(value) ? value : []
  const [urlCache, setUrlCache] = useState<Record<string, string>>({})
  const [nameCache, setNameCache] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Fetch preview URLs for IDs not yet in cache
  useEffect(() => {
    const missing = ids.filter((id) => !id.startsWith('http') && !(id in urlCache))
    if (missing.length === 0) return
    const token = localStorage.getItem('plank_token')
    Promise.all(
      missing.map((id) =>
        fetch(`/cms/admin/media/${id}/url`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ url: string }>) : null))
          .then((data) => (data ? ([id, data.url] as const) : null))
          .catch(() => null),
      ),
    ).then((results) => {
      const updates: Record<string, string> = {}
      for (const r of results) {
        if (r) updates[r[0]] = r[1]
      }
      if (Object.keys(updates).length > 0) setUrlCache((prev) => ({ ...prev, ...updates }))
    })
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch filenames for IDs not yet in name cache
  useEffect(() => {
    const missing = ids.filter((id) => !id.startsWith('http') && !(id in nameCache))
    if (missing.length === 0) return
    const token = localStorage.getItem('plank_token')
    fetch('/cms/admin/media', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: MediaItem[] }>) : { items: [] }))
      .then((data) => {
        const updates: Record<string, string> = {}
        for (const item of data.items) {
          if (missing.includes(item.id)) updates[item.id] = item.filename
        }
        if (Object.keys(updates).length > 0) setNameCache((prev) => ({ ...prev, ...updates }))
      })
      .catch(() => {})
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  function getPreviewUrl(id: string): string | null {
    if (id.startsWith('http')) return id
    return urlCache[id] ?? null
  }

  function getFilename(id: string): string {
    return nameCache[id] ?? ''
  }

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    onChange(arrayMove(ids, oldIndex, newIndex))
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    let currentIds = ids
    try {
      for (const file of files) {
        const data = await uploadFile(file)
        setUrlCache((prev) => ({ ...prev, [data.id]: data.url }))
        setNameCache((prev) => ({ ...prev, [data.id]: file.name }))
        currentIds = [...currentIds, data.id]
        onChange(currentIds)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          handleFiles(files)
        }}
      />

      {ids.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ids.map((id) => (
                <SortableGalleryItem
                  key={id}
                  id={id}
                  previewUrl={getPreviewUrl(id)}
                  filename={getFilename(id)}
                  onRemove={() => onChange(ids.filter((i) => i !== id))}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex w-full gap-2 rounded-md border border-dashed p-3">
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => inputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <UploadIcon className="size-4" />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => setPickerOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <FolderOpenIcon className="size-4" />
          Library
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={['image']}
        onSelect={(item) => {
          if (!ids.includes(item.id)) {
            setUrlCache((prev) => ({ ...prev, [item.id]: item.url }))
            setNameCache((prev) => ({ ...prev, [item.id]: item.filename }))
            onChange([...ids, item.id])
          }
        }}
      />
    </div>
  )
}

function FloatInput({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  const [raw, setRaw] = useState(() =>
    value !== null && value !== undefined && value !== '' ? String(value) : '',
  )

  useEffect(() => {
    if (value === null || value === undefined || value === '') {
      setRaw('')
      return
    }
    const n = typeof value === 'number' ? value : parseFloat(String(value))
    if (!isNaN(n) && n !== parseFloat(raw)) setRaw(String(n))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const s = e.target.value.replace(',', '.')
    setRaw(s)
    if (s === '' || s === '-') {
      onChange(null)
      return
    }
    const n = parseFloat(s)
    if (!isNaN(n)) onChange(n)
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={cn('w-full', 'text-base!')}
      value={raw}
      placeholder="0.00"
      onChange={handleChange}
      disabled={disabled}
    />
  )
}

function DateTimeInput({
  value,
  onChange,
  timezone,
  disabled = false,
}: {
  value: string | null | undefined
  onChange: (v: unknown) => void
  timezone: string
  disabled?: boolean
}) {
  const [calOpen, setCalOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>()
  const [time, setTime] = useState('00:00')

  useEffect(() => {
    if (!value) {
      setDate(undefined)
      setTime('00:00')
      return
    }
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      setDate(d)
      setTime(getTimeInTimezone(value, timezone))
    }
  }, [value, timezone])

  function handleDateSelect(d: Date | undefined) {
    setDate(d)
    setCalOpen(false)
    if (d) onChange(combineDateAndTime(d, time, timezone))
  }

  function handleTimeChange(t: string) {
    setTime(t)
    if (date) onChange(combineDateAndTime(date, t, timezone))
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={calOpen && !disabled} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-40 justify-between font-normal text-base" disabled={disabled}>
            {date ? format(date, 'MMM d, yyyy') : 'Select date'}
            <ChevronDownIcon className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            captionLayout="dropdown"
            defaultMonth={date ?? new Date()}
            onSelect={handleDateSelect}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        className="w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none text-base!"
        value={time}
        onChange={(e) => handleTimeChange(e.target.value)}
        disabled={disabled}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setDate(undefined)
            setTime('00:00')
            onChange(null)
          }}
          disabled={disabled}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

type RelationEntry = { id: string; label: string }

type CTField = { name: string; type: string }

function pickDisplayField(fields: CTField[]): string | null {
  return (
    fields.find((f) => f.type === 'uid')?.name ??
    fields.find((f) => f.type === 'string')?.name ??
    null
  )
}

type CTSummary = { slug: string; tableName: string; fields: CTField[] }

// Resolves a CT's slug and fields from its tableName — the stable identifier.
// The result is module-level cached so all relation inputs on the same page share it.
const ctListCache: { data: CTSummary[] | null; promise: Promise<CTSummary[]> | null } = {
  data: null,
  promise: null,
}

function fetchCTList(headers: HeadersInit): Promise<CTSummary[]> {
  if (ctListCache.data) return Promise.resolve(ctListCache.data)
  if (ctListCache.promise) return ctListCache.promise
  ctListCache.promise = fetch('/cms/admin/content-types', { headers })
    .then((r) => (r.ok ? (r.json() as Promise<CTSummary[]>) : []))
    .then((list) => {
      ctListCache.data = list
      return list
    })
    .catch(() => [])
  return ctListCache.promise
}

function resolveByTable(list: CTSummary[], tableName: string): CTSummary | null {
  return list.find((ct) => ct.tableName === tableName) ?? null
}

function fetchEntries(slug: string, headers: HeadersInit) {
  return fetch(`/cms/admin/content-types/${slug}/entries?limit=200`, { headers })
    .then((r) => (r.ok ? (r.json() as Promise<{ data: Record<string, unknown>[] }>) : { data: [] }))
    .catch(() => ({ data: [] }))
}

// For M:1, 1:1, M:M — fetch all entries from the related CT for selection
function useRelationEntries(relatedTable: string) {
  const [entries, setEntries] = useState<RelationEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!relatedTable) return
    setLoading(true)
    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetchCTList(headers)
      .then(
        (list): Promise<{ ctDef: CTSummary | null; res: { data: Record<string, unknown>[] } }> => {
          const ct = resolveByTable(list, relatedTable)
          if (!ct) return Promise.resolve({ ctDef: null, res: { data: [] } })
          return fetchEntries(ct.slug, headers).then((res) => ({ ctDef: ct, res }))
        },
      )
      .then(({ ctDef, res }) => {
        const displayField = ctDef ? pickDisplayField(ctDef.fields ?? []) : null
        setEntries(
          res.data.map((e) => ({
            id: String(e.id),
            label: displayField ? String(e[displayField] ?? e.id) : String(e.id),
          })),
        )
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [relatedTable])

  return { entries, loading }
}

// For 1:M — fetch entries from the related CT filtered by the FK field pointing back here
function useLinkedEntries(relatedTable: string, relatedField: string, currentId: string) {
  const [entries, setEntries] = useState<RelationEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!relatedTable || !currentId) {
      setEntries([])
      return
    }
    setLoading(true)
    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetchCTList(headers)
      .then(
        (list): Promise<{ ctDef: CTSummary | null; res: { data: Record<string, unknown>[] } }> => {
          const ct = resolveByTable(list, relatedTable)
          if (!ct) return Promise.resolve({ ctDef: null, res: { data: [] } })
          return fetchEntries(ct.slug, headers).then((res) => ({ ctDef: ct, res }))
        },
      )
      .then(({ ctDef, res }) => {
        const displayField = ctDef ? pickDisplayField(ctDef.fields ?? []) : null
        const linked = res.data.filter((e) => String(e[relatedField] ?? '') === currentId)
        setEntries(
          linked.map((e) => ({
            id: String(e.id),
            label: displayField ? String(e[displayField] ?? e.id) : String(e.id),
          })),
        )
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [relatedTable, relatedField, currentId])

  return { entries, loading }
}

function OneToManyDisplay({
  relatedTable,
  relatedField,
  currentId,
}: {
  relatedTable: string
  relatedField: string
  currentId: string
}) {
  const { entries, loading } = useLinkedEntries(relatedTable, relatedField, currentId)

  if (!currentId) {
    return (
      <p className="text-xs text-muted-foreground">Save this entry first to see linked items.</p>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3.5" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No linked entries.</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <span
          key={e.id}
          className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs"
        >
          {e.label}
        </span>
      ))}
    </div>
  )
}

function RelationInput({
  relationType,
  relatedTable,
  relatedField,
  currentEntryId,
  value,
  onChange,
  disabled = false,
}: {
  relationType: RelationType
  relatedTable: string
  relatedField: string
  currentEntryId: string
  value: string | string[] | null
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  const isMulti = relationType === 'many-to-many'
  const [open, setOpen] = useState(false)
  const { entries, loading } = useRelationEntries(relatedTable)

  if (relationType === 'one-to-many') {
    return (
      <OneToManyDisplay
        relatedTable={relatedTable}
        relatedField={relatedField}
        currentId={currentEntryId}
      />
    )
  }

  const selectedIds: string[] = isMulti
    ? Array.isArray(value)
      ? value
      : []
    : value && !Array.isArray(value)
      ? [value]
      : []

  function getLabel(id: string) {
    return entries.find((e) => e.id === id)?.label ?? id
  }

  function toggleEntry(id: string) {
    if (isMulti) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
      onChange(next.length > 0 ? next : null)
    } else {
      onChange(selectedIds[0] === id ? null : id)
      setOpen(false)
    }
  }

  function removeId(id: string) {
    if (isMulti) {
      const next = selectedIds.filter((s) => s !== id)
      onChange(next.length > 0 ? next : null)
    } else {
      onChange(null)
    }
  }

  const triggerLabel = isMulti
    ? selectedIds.length > 0
      ? `${selectedIds.length} selected`
      : 'Select entries…'
    : selectedIds.length > 0
      ? getLabel(selectedIds[0])
      : 'Select entry…'

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal text-base"
            disabled={disabled}
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="size-4" />
                </div>
              ) : (
                <>
                  <CommandEmpty>No entries found.</CommandEmpty>
                  <CommandGroup>
                    {entries.map((entry) => {
                      const selected = selectedIds.includes(entry.id)
                      return (
                        <CommandItem
                          key={entry.id}
                          value={entry.label}
                          onSelect={() => {
                            if (disabled) return
                            toggleEntry(entry.id)
                          }}
                        >
                          <CheckIcon
                            className={`mr-2 size-4 ${selected ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <span className="truncate">{entry.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground opacity-60 shrink-0">
                            {entry.id.slice(0, 8)}
                          </span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs"
            >
              {getLabel(id)}
              <button
                type="button"
                onClick={() => removeId(id)}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const ARRAY_ITEM_WIDTH: Record<string, string> = {
  full: 'col-span-6',
  'two-thirds': 'col-span-4',
  half: 'col-span-3',
  third: 'col-span-2',
}

function ArrayInput({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
  const subFields = field.arrayFields ?? []

  function buildEmptyItem(): Record<string, unknown> {
    return Object.fromEntries(
      subFields.map((sf) => [sf.name, sf.type === 'boolean' ? false : null]),
    )
  }

  function handleAddItem() {
    onChange([...items, buildEmptyItem()])
  }

  function handleRemoveItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function handleItemChange(index: number, subFieldName: string, subValue: unknown) {
    onChange(items.map((item, i) => (i === index ? { ...item, [subFieldName]: subValue } : item)))
  }

  if (subFields.length === 0) {
    return (
      <div className="flex w-full items-center justify-center rounded-md border border-dashed p-4 text-xs text-muted-foreground">
        No sub-fields defined for this array.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
            <button
              type="button"
              onClick={() => handleRemoveItem(index)}
              disabled={disabled}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {subFields.map((sf) => (
              <div key={sf.name} className={ARRAY_ITEM_WIDTH[sf.width ?? 'full'] ?? 'col-span-6'}>
                <div className="mb-1 flex items-center gap-1">
                  <Label className="text-xs font-medium">
                    {sf.name}
                    {sf.required && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                </div>
                <FieldInput
                  field={{ ...sf, type: sf.type as FieldType }}
                  value={item[sf.name] ?? null}
                  onChange={(v) => handleItemChange(index, sf.name, v)}
                  allValues={item}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddItem}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <PlusIcon className="size-3.5" />
        Add item
      </button>
    </div>
  )
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
}

function RichTextInput({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const resolveRef = useRef<((img: ImageInsert | null) => void) | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function onInsertImage(): Promise<ImageInsert | null> {
    setInsertOpen(true)
    return new Promise((resolve) => {
      resolveRef.current = resolve
    })
  }

  function resolveWith(img: ImageInsert | null) {
    resolveRef.current?.(img)
    resolveRef.current = null
  }

  function handleInsertOpenChange(open: boolean) {
    if (!open) resolveWith(null)
    setInsertOpen(open)
  }

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const data = await uploadMediaFile(file)
      resolveWith({ src: data.url, alt: data.alt, width: data.width, height: data.height })
      setInsertOpen(false)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <div className={disabled ? 'pointer-events-none opacity-70' : ''}>
        <RichTextEditor
          value={String(value ?? '')}
          onChange={onChange}
          placeholder="Type or add your content here..."
          onInsertImage={onInsertImage}
        />
      </div>
      <Dialog open={insertOpen} onOpenChange={handleInsertOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
          </DialogHeader>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
            className="flex w-full gap-2 rounded-md border border-dashed p-3"
          >
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <UploadIcon className="size-4" />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <div className="w-px bg-border" />
            <button
              type="button"
              disabled={uploading}
              onClick={() => setPickerOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <FolderOpenIcon className="size-4" />
              Library
            </button>
          </div>
          {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
        </DialogContent>
      </Dialog>
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open && !insertOpen) resolveWith(null)
          setPickerOpen(open)
        }}
        allowedTypes={['image']}
        onSelect={(item) => {
          resolveWith({ src: item.url, alt: item.alt, width: item.width, height: item.height })
          setPickerOpen(false)
          setInsertOpen(false)
        }}
      />
    </>
  )
}

export function FieldInput({ field, value, onChange, allValues, disabled }: FieldInputProps) {
  const uidManual = useRef(false)
  const { timezone } = useSettings()

  // Auto-derive UID from targetField while user hasn't manually edited it.
  // The UID must remain global (not per-locale). Generate only from the non-localized
  // source value (`allValues[targetField]`). If localization is active and there's no
  // non-localized source value, do NOT auto-generate (user should disable localization
  // or provide the non-localized value first).
  useEffect(() => {
    if (field.type !== 'uid' || !field.targetField || uidManual.current) return

    const meta: any = allValues as any
    const target = field.targetField

    const localizationEnabled = Boolean(meta.__localizationEnabled)

    // Prefer top-level (non-localized) value
    const topValue = (allValues as any)[target]
    if (topValue !== undefined && topValue !== null && String(topValue).trim() !== '') {
      onChange(toSlug(String(topValue)))
      return
    }

    // If localization is enabled and there's no top-level value, attempt to use
    // the value from the default locale only. If that's absent, do not auto-generate.
    const localized =
      (allValues as any).localized && typeof (allValues as any).localized === 'object'
        ? (allValues as any).localized
        : {}
    if (localizationEnabled) {
      const defaultLocale = (allValues as any).__defaultLocale as string | undefined
      if (
        defaultLocale &&
        localized[defaultLocale] &&
        localized[defaultLocale][target] !== undefined &&
        String(localized[defaultLocale][target]).trim() !== ''
      ) {
        onChange(toSlug(String(localized[defaultLocale][target])))
      }
      return
    }

    // If localization is not enabled, attempt to fall back to any localized value
    // (rare case for legacy data), but this is secondary to top-level.
    const keys = Object.keys(localized).filter((k) => !k.startsWith('_'))
    for (const k of keys) {
      if (
        localized[k] &&
        localized[k][target] !== undefined &&
        String(localized[k][target]).trim() !== ''
      ) {
        onChange(toSlug(String(localized[k][target])))
        return
      }
    }
  }, [
    field.type,
    field.targetField,
    (allValues as any)[field.targetField ?? ''],
    JSON.stringify((allValues as any).localized ?? {}),
    (allValues as any).__localizationEnabled,
  ])

  const sharedClass = 'w-full'

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id={`field-${field.name}`}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(Boolean(v))}
          disabled={Boolean(disabled)}
        />
        <Label htmlFor={`field-${field.name}`} className="cursor-pointer font-normal text-base">
          {value ? 'Yes' : 'No'}
        </Label>
      </div>
    )
  }

  if (field.type === 'richtext') {
    return <RichTextInput value={value} onChange={onChange} disabled={Boolean(disabled)} />
  }

  if (field.type === 'text') {
    return (
      <Textarea
        className={cn(sharedClass, 'text-base')}
        value={String(value ?? '')}
        placeholder={field.name}
        onChange={(e) => onChange(e.target.value)}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'number') {
    if (field.subtype === 'float') {
      return <FloatInput value={value} onChange={onChange} disabled={Boolean(disabled)} />
    }
    return (
      <Input
        type="number"
        className={cn(sharedClass, 'text-base!')}
        value={value === undefined || value === null ? '' : String(value)}
        step="1"
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange(null)
            return
          }
          onChange(parseInt(raw, 10))
        }}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'datetime') {
    return (
      <DateTimeInput
        value={value as string | null | undefined}
        onChange={onChange}
        timezone={timezone}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'uid') {
    return (
      <Input
        className={cn(sharedClass, 'text-base md:text-base')}
        value={String(value ?? '')}
        placeholder="auto-generated"
        onChange={(e) => {
          const v = e.target.value
          // If user cleared the UID, allow auto-generation again
          uidManual.current = Boolean(v && v !== '')
          onChange(e.target.value)
        }}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'media') {
    return (
      <MediaInput
        value={value as string | null}
        onChange={onChange}
        allowedTypes={field.allowedTypes}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'media-gallery') {
    return <MediaGalleryInput value={value as string[] | null} onChange={onChange} disabled={Boolean(disabled)} />
  }

  if (field.type === 'relation') {
    return (
      <RelationInput
        relationType={field.relationType ?? 'many-to-one'}
        relatedTable={field.relatedTable ?? ''}
        relatedField={field.relatedField ?? ''}
        currentEntryId={String(allValues.id ?? '')}
        value={value as string | string[] | null}
        onChange={onChange}
        disabled={Boolean(disabled)}
      />
    )
  }

  if (field.type === 'array') {
    return <ArrayInput field={field} value={value} onChange={onChange} disabled={Boolean(disabled)} />
  }

  // string fallback
  return (
    <Input
      className={cn(sharedClass, 'text-base md:text-base')}
      value={String(value ?? '')}
      placeholder={field.name}
      onChange={(e) => onChange(e.target.value)}
      disabled={Boolean(disabled)}
    />
  )
}
