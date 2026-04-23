import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Button } from '@/components/ui/button.tsx'
import { UploadIcon, XIcon, ImageIcon } from 'lucide-react'

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

function MediaInput({ value, onChange, allowedTypes }: { value: string | null; onChange: (v: unknown) => void; allowedTypes?: FieldDef['allowedTypes'] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
      >
        <UploadIcon className="size-4" />
        {uploading ? 'Uploading…' : 'Upload file'}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function toSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
}

export function FieldInput({ field, value, onChange, allValues }: FieldInputProps) {
  const uidManual = useRef(false)

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

  if (field.type === 'text' || field.type === 'richtext') {
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
      <Input
        type="datetime-local"
        className={sharedClass}
        value={value ? String(value).slice(0, 16) : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
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
