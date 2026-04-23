import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { Trash2Icon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.tsx'
import { FieldInput } from '@/components/content/FieldInput.tsx'
import type { FieldDef } from '@/components/content/FieldInput.tsx'
import { FIELD_WIDTH_SPAN } from '@/components/content-types/FieldCard.tsx'
import type { FieldWidth } from '@/components/content-types/FieldCard.tsx'

type ContentType = {
  name: string
  slug: string
  fields: FieldDef[]
}

type Entry = Record<string, unknown> & { status?: 'draft' | 'published' }

export function EntryForm() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const navigate = useNavigate()
  const isNew = !id

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null
  )
  const { data: existing, loading: loadingEntry } = useFetch<Entry>(
    slug && id ? `/cms/admin/entries/${slug}/${id}` : null
  )

  const { loading: saving, request } = useApi<Entry>()
  const { loading: patching, request: requestStatus } = useApi<Entry>()
  const { loading: deleting, request: requestDelete } = useApi()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const original = useRef<string>('{}')
  const skipBlocker = useRef(false)

  useEffect(() => {
    if (isNew) {
      const empty: Record<string, unknown> = {}
      ct?.fields.forEach((f) => { empty[f.name] = f.type === 'boolean' ? false : '' })
      setValues(empty)
      setStatus('draft')
      original.current = JSON.stringify(empty)
      return
    }
    if (!existing || !ct) return
    const initial: Record<string, unknown> = {}
    ct.fields.forEach((f) => { initial[f.name] = existing[f.name] ?? (f.type === 'boolean' ? false : '') })
    setValues(initial)
    setStatus(existing.status ?? 'draft')
    original.current = JSON.stringify(initial)
  }, [existing, ct, isNew])

  const isDirty = JSON.stringify(values) !== original.current

  const blocker = useBlocker(useCallback(() => {
    if (skipBlocker.current) return false
    return isDirty
  }, [isDirty]))

  function handleChange(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function saveFields(): Promise<Entry | null> {
    if (!slug || !ct) return null
    const body: Record<string, unknown> = {}
    ct.fields.forEach((f) => {
      const v = values[f.name]
      if (v !== '' && v !== null && v !== undefined) body[f.name] = v
    })

    try {
      const saved = await request(
        isNew ? `/cms/admin/content-types/${slug}/entries` : `/cms/admin/entries/${slug}/${id}`,
        isNew ? 'POST' : 'PUT',
        body
      )
      original.current = JSON.stringify(values)
      return saved
    } catch {
      return null
    }
  }

  async function handleSaveDraft() {
    const saved = await saveFields()
    if (!saved) return
    if (isNew) {
      skipBlocker.current = true
      navigate(`/content/${slug}/${saved.id}`, { replace: true })
    }
  }

  async function handlePublish() {
    const saved = await saveFields()
    if (!saved) return

    const entryId = isNew ? (saved.id as string) : id!
    if (isNew) {
      skipBlocker.current = true
    }

    try {
      await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', { status: 'published' })
      setStatus('published')
      if (isNew) {
        navigate(`/content/${slug}/${entryId}`, { replace: true })
      }
    } catch {
      if (isNew) {
        navigate(`/content/${slug}/${entryId}`, { replace: true })
      }
    }
  }

  async function handleRevertToDraft() {
    if (!slug || !id) return
    try {
      await requestStatus(`/cms/admin/entries/${slug}/${id}/status`, 'PATCH', { status: 'draft' })
      setStatus('draft')
    } catch {
      // surfaced by useApi
    }
  }

  async function handleDelete() {
    if (!slug || !id) return
    try {
      await requestDelete(`/cms/admin/entries/${slug}/${id}`, 'DELETE')
      skipBlocker.current = true
      navigate(`/content/${slug}`, { replace: true })
    } catch {
      // surfaced by useApi
    }
  }

  const loading = loadingCt || (!isNew && loadingEntry)
  const busy = saving || patching

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!ct) return null

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{ct.name}</p>
          <h1 className="text-2xl font-bold">{isNew ? 'New entry' : 'Edit entry'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status === 'published' ? 'default' : 'secondary'}>
            {status === 'published' ? 'Published' : 'Draft'}
          </Badge>
          {!isNew && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
          {!isNew && status === 'published' && (
            <Button variant="outline" onClick={handleRevertToDraft} disabled={busy}>
              {patching ? <Spinner className="size-4" /> : null}
              Revert to draft
            </Button>
          )}
          <Button variant="outline" onClick={handleSaveDraft} disabled={!isDirty || busy}>
            {saving ? <Spinner className="size-4" /> : null}
            Save draft
          </Button>
          <Button onClick={handlePublish} disabled={(!isDirty && status === 'published') || busy}>
            {saving || patching ? <Spinner className="size-4" /> : null}
            Publish
          </Button>
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-6 gap-4">
        {ct.fields.map((field) => (
          <div key={field.name} className={FIELD_WIDTH_SPAN[(field.width as FieldWidth) ?? 'full']}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`entry-${field.name}`} className="capitalize">
                {field.name.replace(/_/g, ' ')}
                {field.required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <FieldInput
                field={field}
                value={values[field.name]}
                onChange={(v) => handleChange(field.name, v)}
                allValues={values}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Spinner className="size-4" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes blocker */}
      <Dialog open={blocker.state === 'blocked'} onOpenChange={() => blocker.reset?.()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Leave without saving?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>Stay</Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
