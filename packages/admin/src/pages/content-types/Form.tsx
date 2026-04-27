import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { PlusIcon, Trash2Icon, LayersIcon, ListIcon, FileIcon } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApi } from '@/hooks/useApi.ts'
import { useFetch } from '@/hooks/useFetch.ts'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut.ts'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty.tsx'
import { FieldCard, FIELD_WIDTH_SPAN } from '@/components/content-types/FieldCard.tsx'
import type { FieldCardData, FieldWidth } from '@/components/content-types/FieldCard.tsx'
import { AddFieldDialog } from '@/components/content-types/AddFieldDialog.tsx'

type ContentTypeKind = 'collection' | 'single'

type ContentType = {
  id?: string
  name: string
  slug: string
  kind: ContentTypeKind
  tableName: string
  fields: FieldCardData[]
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
}

function toTableName(slug: string) {
  return slug.replace(/-/g, '_')
}

// Wraps FieldCard with dnd-kit sortable behavior
function SortableFieldCard({
  field,
  onWidthChange,
  onEdit,
  onDelete,
}: {
  field: FieldCardData
  onWidthChange: (w: FieldWidth) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.name })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={FIELD_WIDTH_SPAN[field.width ?? 'full']}
    >
      <FieldCard
        field={field}
        dragListeners={listeners}
        dragAttributes={attributes}
        onWidthChange={onWidthChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}

export function ContentTypeForm() {
  const { slug: routeSlug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const isNew = !routeSlug

  // Remote data
  const { data: existing, loading: loadingExisting } = useFetch<ContentType>(
    isNew ? '' : `/cms/admin/content-types/${routeSlug}`
  )
  const { data: allCTs, refetch: refetchAllCTs } = useFetch<ContentType[]>('/cms/admin/content-types')
  const { loading: saving, request } = useApi<ContentType>()
  const { loading: deleting, request: requestDelete } = useApi()

  // Local form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<ContentTypeKind>('collection')
  const [fields, setFields] = useState<FieldCardData[]>([])

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [editingField, setEditingField] = useState<FieldCardData | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Track original state for isDirty
  const original = useRef<{ name: string; slug: string; fields: string }>({ name: '', slug: '', fields: '[]' })

  useEffect(() => {
    window.addEventListener('plank:content-types-changed', refetchAllCTs)
    return () => window.removeEventListener('plank:content-types-changed', refetchAllCTs)
  }, [refetchAllCTs])

  useEffect(() => {
    if (isNew) {
      setName('')
      setSlug('')
      setKind('collection')
      setFields([])
      original.current = { name: '', slug: '', fields: '[]' }
      return
    }
    if (!existing) return
    setName(existing.name)
    setSlug(existing.slug)
    setKind(existing.kind ?? 'collection')
    setFields(existing.fields)
    original.current = {
      name: existing.name,
      slug: existing.slug,
      fields: JSON.stringify(existing.fields),
    }
  }, [existing, isNew])

  // Auto-derive slug from name (only for new CTs — existing slug is fixed)
  useEffect(() => {
    if (isNew && name) setSlug(toSlug(name))
  }, [isNew, name])

  const isDirty =
    name !== original.current.name ||
    JSON.stringify(fields) !== original.current.fields

  // Ref that disables the blocker during a programmatic save+navigate.
  // useBlocker evaluates its function at navigation time and reads the ref
  // directly, bypassing the stale-render value of isDirty.
  const skipBlocker = useRef(false)
  const blocker = useBlocker(useCallback(() => {
    if (skipBlocker.current) return false
    return isDirty
  }, [isDirty]))

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.name === active.id)
      const newIndex = prev.findIndex((f) => f.name === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleAddField(field: FieldCardData) {
    setFields((prev) => [...prev, field])
  }

  function handleEditField(field: FieldCardData) {
    setFields((prev) => prev.map((f) => (f.name === editingField?.name ? field : f)))
    setEditingField(null)
  }

  function handleDeleteField(name: string) {
    setFields((prev) => prev.filter((f) => f.name !== name))
  }

  function handleWidthChange(fieldName: string, width: FieldWidth) {
    setFields((prev) => prev.map((f) => (f.name === fieldName ? { ...f, width } : f)))
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) return
    const body = isNew
      ? { name: name.trim(), slug, kind, tableName: toTableName(slug), fields }
      : { name: name.trim(), slug, tableName: toTableName(slug), fields }
    try {
      const saved = await request(
        isNew ? '/cms/admin/content-types' : `/cms/admin/content-types/${routeSlug}`,
        isNew ? 'POST' : 'PUT',
        body
      )
      setName(saved.name)
      setSlug(saved.slug)
      setFields(saved.fields)
      original.current = { name: saved.name, slug: saved.slug, fields: JSON.stringify(saved.fields) }
      window.dispatchEvent(new CustomEvent('plank:content-types-changed'))
      if (isNew || saved.slug !== routeSlug) {
        skipBlocker.current = true
        navigate(`/content-types/${saved.slug}`, { replace: true })
      }
    } catch {
      // error surfaced by useApi
    }
  }

  async function handleDelete() {
    try {
      await requestDelete(`/cms/admin/content-types/${routeSlug}`, 'DELETE')
      window.dispatchEvent(new CustomEvent('plank:content-types-changed'))
      navigate('/content-types', { replace: true })
    } catch {
      // error surfaced by useApi
    }
  }

  const availableContentTypes = (allCTs ?? [])
    .filter((ct) => ct.slug !== routeSlug)
    .map((ct) => ({ tableName: ct.tableName, slug: ct.slug, name: ct.name }))

  const stringFields = fields.filter((f) => f.type === 'string')

  const existingFieldNames = fields.map((f) => f.name)

  useKeyboardShortcut('mod+s', handleSave, { enabled: isDirty && !saving && !!name.trim(), label: 'Save content type' })
  useKeyboardShortcut('mod+k', () => setAddOpen(true), { label: 'Add field' })

  if (!isNew && loadingExisting) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Content type name"
            className="bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">API ID:</span>
              <span className="text-sm text-muted-foreground">{slug || '—'}</span>
            </div>
            {isNew ? (
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setKind('collection')}
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${kind === 'collection' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <ListIcon className="size-3" />
                  Collection
                </button>
                <button
                  type="button"
                  onClick={() => setKind('single')}
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${kind === 'single' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <FileIcon className="size-3" />
                  Single
                </button>
              </div>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground ${kind === 'single' ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400' : ''}`}>
                {kind === 'single' ? <FileIcon className="size-3" /> : <ListIcon className="size-3" />}
                {kind === 'single' ? 'Single' : 'Collection'}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
          <Button onClick={handleSave} disabled={!isDirty || saving || !name.trim()}>
            {saving ? <Spinner className="size-4" /> : null}
            Save
          </Button>
        </div>
      </div>

      {/* Fields grid */}
      {fields.length > 0 ? (() => {
        const editableFields = fields.filter((f) => f.relationType !== 'one-to-many')
        const inverseFields = fields.filter((f) => f.relationType === 'one-to-many')
        return (
          <div className="flex flex-col gap-3">
            {editableFields.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={editableFields.map((f) => f.name)} strategy={verticalListSortingStrategy}>
                  <div className="grid grid-cols-6 gap-3">
                    {editableFields.map((field) => (
                      <SortableFieldCard
                        key={field.name}
                        field={field}
                        onWidthChange={(w) => handleWidthChange(field.name, w)}
                        onEdit={() => setEditingField(field)}
                        onDelete={() => handleDeleteField(field.name)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {inverseFields.length > 0 && (
              <div className="grid grid-cols-6 gap-3">
                {inverseFields.map((field) => (
                  <div key={field.name} className={`col-span-6`}>
                    <FieldCard field={field} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })() : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>No fields yet</EmptyTitle>
            <EmptyDescription>Add your first field to define this content type's structure.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Add field button */}
      <div className="mt-4">
        <Button variant="outline" onClick={() => setAddOpen(true)} className="gap-2">
          <PlusIcon className="size-4" />
          Add field
        </Button>
      </div>

      {/* Add field dialog */}
      <AddFieldDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingNames={existingFieldNames}
        availableContentTypes={availableContentTypes}
        stringFields={stringFields}
        onConfirm={handleAddField}
      />

      {/* Edit field dialog */}
      <AddFieldDialog
        open={Boolean(editingField)}
        onOpenChange={(val) => { if (!val) setEditingField(null) }}
        existingNames={existingFieldNames}
        availableContentTypes={availableContentTypes}
        stringFields={stringFields}
        initialField={editingField ?? undefined}
        onConfirm={handleEditField}
      />

      {/* Delete CT confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete "{name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the content type and all its entries. This action cannot be undone.
          </p>
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
          <p className="text-sm text-muted-foreground">
            You have unsaved changes. Leave without saving?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>Stay</Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
