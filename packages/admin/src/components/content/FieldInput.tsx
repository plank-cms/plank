import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
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
import { RichTextEditor } from '@/components/ui/rich-text-editor.tsx'
import { UploadIcon, XIcon, ImageIcon, FolderOpenIcon, FileIcon, ChevronDownIcon } from 'lucide-react'

type FieldType = 'string' | 'text' | 'richtext' | 'number' | 'boolean' | 'datetime' | 'media' | 'relation' | 'uid'

export type FieldDef = {
  name: string
  type: FieldType
  required?: boolean
  subtype?: 'integer' | 'float'
  targetField?: string
  relatedTable?: string
  allowedTypes?: ('image' | 'video' | 'audio' | 'document')[]
  width?: string
}

type FieldInputProps = {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
  allValues: Record<string, unknown>
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

type MediaItem = { id: string; filename: string; url: string; mime_type: string | null }

function isImageMime(mime: string | null) {
  return mime?.startsWith('image/') ?? false
}

function MediaPickerDialog({ open, onOpenChange, allowedTypes, onSelect }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allowedTypes?: FieldDef['allowedTypes']
  onSelect: (item: MediaItem) => void
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const token = localStorage.getItem('plank_token')
    fetch('/cms/admin/media', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.ok ? r.json() as Promise<{ items: MediaItem[] }> : { items: [] })
      .then((data) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = items.filter((item) => {
    if (!allowedTypes || allowedTypes.length === 0) return true
    const mime = item.mime_type ?? ''
    return allowedTypes.some((t) => {
      if (t === 'image') return mime.startsWith('image/')
      if (t === 'video') return mime.startsWith('video/')
      if (t === 'audio') return mime.startsWith('audio/')
      if (t === 'document') return mime.startsWith('application/') || mime.startsWith('text/')
      return false
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-5" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No media found.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelect(item); onOpenChange(false) }}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted transition-colors hover:border-primary"
              >
                {isImageMime(item.mime_type) ? (
                  <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                    <FileIcon className="size-6 text-muted-foreground" />
                    <span className="w-full truncate text-center text-[10px] text-muted-foreground">{item.filename}</span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-md ring-2 ring-primary ring-offset-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MediaInput({ value, onChange, allowedTypes }: { value: string | null; onChange: (v: unknown) => void; allowedTypes?: FieldDef['allowedTypes'] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // value is either null, a legacy URL (starts with http), or a media ID (UUID)
  const isLegacyUrl = typeof value === 'string' && value.startsWith('http')

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return }
    if (isLegacyUrl) { setPreviewUrl(value); return }
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
    const token = localStorage.getItem('plank_token')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/cms/admin/media', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      if (!res.ok) throw new Error('Upload failed.')
      const data = (await res.json()) as { id: string; url: string }
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
          onClick={() => { onChange(null); setPreviewUrl(null) }}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={buildAccept(allowedTypes)} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
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
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={allowedTypes}
        onSelect={(item) => { setPreviewUrl(item.url); onChange(item.id) }}
      />
    </div>
  )
}

function DateTimeInput({ value, onChange, timezone }: {
  value: string | null | undefined
  onChange: (v: unknown) => void
  timezone: string
}) {
  const [calOpen, setCalOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>()
  const [time, setTime] = useState('00:00')

  useEffect(() => {
    if (!value) { setDate(undefined); setTime('00:00'); return }
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
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-40 justify-between font-normal">
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
        className="w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        value={time}
        onChange={(e) => handleTimeChange(e.target.value)}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => { setDate(undefined); setTime('00:00'); onChange(null) }}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function toSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
}

export function FieldInput({ field, value, onChange, allValues }: FieldInputProps) {
  const uidManual = useRef(false)
  const { timezone } = useSettings()

  // Auto-derive UID from targetField while user hasn't manually edited it
  useEffect(() => {
    if (field.type !== 'uid' || !field.targetField || uidManual.current) return
    const source = String(allValues[field.targetField] ?? '')
    onChange(toSlug(source))
  }, [field.type, field.targetField, allValues[field.targetField ?? '']]) // eslint-disable-line react-hooks/exhaustive-deps

  const sharedClass = 'w-full'

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id={`field-${field.name}`}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(Boolean(v))}
        />
        <Label htmlFor={`field-${field.name}`} className="cursor-pointer font-normal text-sm">
          {value ? 'Yes' : 'No'}
        </Label>
      </div>
    )
  }

  if (field.type === 'richtext') {
    return (
      <RichTextEditor
        value={String(value ?? '')}
        onChange={onChange}
        placeholder={field.name}
      />
    )
  }

  if (field.type === 'text') {
    return (
      <Textarea
        className={sharedClass}
        value={String(value ?? '')}
        placeholder={field.name}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <Input
        type="number"
        className={sharedClass}
        value={value === undefined || value === null ? '' : String(value)}
        step={field.subtype === 'float' ? 'any' : '1'}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') { onChange(null); return }
          onChange(field.subtype === 'float' ? parseFloat(raw) : parseInt(raw, 10))
        }}
      />
    )
  }

  if (field.type === 'datetime') {
    return (
      <DateTimeInput
        value={value as string | null | undefined}
        onChange={onChange}
        timezone={timezone}
      />
    )
  }

  if (field.type === 'uid') {
    return (
      <Input
        className={sharedClass}
        value={String(value ?? '')}
        placeholder="auto-generated-slug"
        onChange={(e) => {
          uidManual.current = true
          onChange(e.target.value)
        }}
      />
    )
  }

  if (field.type === 'media') {
    return <MediaInput value={value as string | null} onChange={onChange} allowedTypes={field.allowedTypes} />
  }

  if (field.type === 'relation') {
    return (
      <Input
        className={sharedClass}
        value={String(value ?? '')}
        placeholder="Entry ID"
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // string fallback
  return (
    <Input
      className={sharedClass}
      value={String(value ?? '')}
      placeholder={field.name}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
