import { useState, useEffect } from 'react'
import {
  TypeIcon,
  AlignLeftIcon,
  FileTextIcon,
  HashIcon,
  ToggleLeftIcon,
  CalendarIcon,
  ImageIcon,
  LayoutGridIcon,
  LinkIcon,
  FingerprintIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import type { FieldCardData, MediaAllowedType, RelationType } from './FieldCard.tsx'
import { DEFAULT_FIELD_WIDTH } from './FieldCard.tsx'

type FieldType = FieldCardData['type']
type StringField = { name: string }

type TypeOption = {
  type: FieldType
  subtype?: 'integer' | 'float'
  icon: LucideIcon
  label: string
  description: string
  color: string
  bg: string
  disabled?: boolean
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    type: 'string',
    icon: TypeIcon,
    label: 'Text (string)',
    description: 'Titles, names, labels',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    type: 'text',
    icon: AlignLeftIcon,
    label: 'Long text (string)',
    description: 'Plain text, paragraphs',
    color: 'text-sky-600',
    bg: 'bg-sky-50',
  },
  {
    type: 'richtext',
    icon: FileTextIcon,
    label: 'Rich text (blocks)',
    description: 'Formatted HTML content',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    type: 'number',
    subtype: 'integer',
    icon: HashIcon,
    label: 'Integer (number)',
    description: 'Whole numbers',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    type: 'number',
    subtype: 'float',
    icon: HashIcon,
    label: 'Decimal (number)',
    description: 'Numbers with decimals',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    type: 'boolean',
    icon: ToggleLeftIcon,
    label: 'Boolean',
    description: 'True or false',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    type: 'datetime',
    icon: CalendarIcon,
    label: 'Date & time (datetime)',
    description: 'Timestamps and dates',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    type: 'media',
    icon: ImageIcon,
    label: 'Media',
    description: 'Images, videos or files',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
  {
    type: 'media-gallery',
    icon: LayoutGridIcon,
    label: 'Media Gallery',
    description: 'Multiple images for galleries',
    color: 'text-pink-600',
    bg: 'bg-pink-50',
  },
  {
    type: 'uid',
    icon: FingerprintIcon,
    label: 'UID',
    description: 'Unique slug from a field',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    type: 'relation',
    icon: LinkIcon,
    label: 'Relation',
    description: 'Link to another content type',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
]

const MEDIA_TYPE_OPTIONS: { value: MediaAllowedType; label: string }[] = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
]

const RELATION_TYPE_OPTIONS: { value: RelationType; label: string; description: string }[] = [
  { value: 'many-to-one', label: 'Many-to-One', description: 'Many of these → one of the other' },
  { value: 'one-to-one', label: 'One-to-One', description: 'One of these ↔ one of the other' },
  { value: 'many-to-many', label: 'Many-to-Many', description: 'Many of these ↔ many of the other' },
]

type ConfigState = {
  name: string
  required: boolean
  relationType: RelationType
  relatedTable: string
  relatedSlug: string
  targetField: string
  allowedTypes: MediaAllowedType[]
}

const EMPTY_CONFIG: ConfigState = {
  name: '',
  required: false,
  relationType: 'many-to-one',
  relatedTable: '',
  relatedSlug: '',
  targetField: '',
  allowedTypes: [],
}

type AvailableCT = { tableName: string; slug: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingNames: string[]
  availableContentTypes: AvailableCT[]
  stringFields: StringField[]
  initialField?: FieldCardData
  onConfirm: (field: FieldCardData) => void
}

export function AddFieldDialog({
  open,
  onOpenChange,
  existingNames,
  availableContentTypes,
  stringFields,
  initialField,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<TypeOption | null>(null)
  const [config, setConfig] = useState<ConfigState>(EMPTY_CONFIG)
  const [nameError, setNameError] = useState('')

  const isEditing = Boolean(initialField)

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setConfig(EMPTY_CONFIG)
      setNameError('')
    } else if (initialField) {
      const match = TYPE_OPTIONS.find(
        (o) =>
          o.type === initialField.type &&
          (o.subtype ?? undefined) === (initialField.subtype ?? undefined),
      )
      setSelected(match ?? null)
      setConfig({
        name: initialField.name,
        required: initialField.required ?? false,
        relationType: initialField.relationType ?? 'many-to-one',
        relatedTable: initialField.relatedTable ?? '',
        relatedSlug: initialField.relatedSlug ?? '',
        targetField: initialField.targetField ?? '',
        allowedTypes: initialField.allowedTypes ?? [],
      })
    }
  }, [open, initialField])

  function handleOpenChange(val: boolean) {
    onOpenChange(val)
  }

  function handleSelectType(option: TypeOption) {
    setSelected(option)
    setConfig(EMPTY_CONFIG)
    setNameError('')
  }

  function handleBack() {
    if (!isEditing) {
      setSelected(null)
      setConfig(EMPTY_CONFIG)
      setNameError('')
    }
  }

  function validate() {
    const trimmed = config.name.trim()
    if (!trimmed) {
      setNameError('Name is required')
      return false
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
      setNameError('Lowercase letters, digits and underscores only')
      return false
    }
    if (existingNames.includes(trimmed) && trimmed !== initialField?.name) {
      setNameError('A field with this name already exists')
      return false
    }
    return true
  }

  function handleConfirm() {
    if (!selected || !validate()) return
    onConfirm({
      name: config.name.trim(),
      type: selected.type,
      subtype: selected.subtype,
      required: config.required || undefined,
      relationType: selected.type === 'relation' ? config.relationType : undefined,
      relatedTable: selected.type === 'relation' ? config.relatedTable : undefined,
      relatedSlug: selected.type === 'relation' ? config.relatedSlug : undefined,
      targetField: selected.type === 'uid' ? config.targetField : undefined,
      allowedTypes:
        selected.type === 'media' && config.allowedTypes.length > 0
          ? config.allowedTypes
          : selected.type === 'media-gallery'
            ? ['image']
            : undefined,
      width: initialField?.width ?? DEFAULT_FIELD_WIDTH[selected.type],
    })
    handleOpenChange(false)
  }

  const showStep2 = Boolean(selected)
  const baseLabel = selected?.label.replace(/\s*\(.*?\)/, '') ?? ''
  const title = isEditing ? 'Edit field' : showStep2 ? `${baseLabel} field` : 'Add a field'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={showStep2 ? 'max-w-md' : 'max-w-2xl'}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {showStep2 && !isEditing && (
              <button
                type="button"
                onClick={handleBack}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <ArrowLeftIcon className="size-4" />
              </button>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>

        {/* Step 1 — type picker */}
        {!showStep2 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {TYPE_OPTIONS.map((option) => {
              const Icon = option.icon
              const key = `${option.type}${option.subtype ?? ''}`
              return (
                <button
                  key={key}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => !option.disabled && handleSelectType(option)}
                  className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div
                    className={`flex size-8 items-center justify-center rounded-md ${option.bg}`}
                  >
                    <Icon className={`size-4 ${option.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.disabled ? 'Coming soon' : option.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Step 2 — configure */}
        {showStep2 && (
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-name">Field name</Label>
              <Input
                id="field-name"
                placeholder="e.g. article_title"
                value={config.name}
                autoFocus
                onChange={(e) => {
                  setConfig((prev) => ({ ...prev, name: e.target.value }))
                  setNameError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm()
                }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
              <p className="text-xs text-muted-foreground">
                Lowercase letters, digits and underscores. Must start with a letter.
              </p>
            </div>

            {selected?.type === 'media' && (
              <div className="flex flex-col gap-2">
                <Label>Allowed file types</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Leave all unchecked to allow any file type.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {MEDIA_TYPE_OPTIONS.map(({ value, label }) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`media-type-${value}`}
                        checked={config.allowedTypes.includes(value)}
                        onCheckedChange={(checked) =>
                          setConfig((prev) => ({
                            ...prev,
                            allowedTypes: checked
                              ? [...prev.allowedTypes, value]
                              : prev.allowedTypes.filter((t) => t !== value),
                          }))
                        }
                      />
                      <Label htmlFor={`media-type-${value}`} className="cursor-pointer font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected?.type === 'uid' && (
              <div className="flex flex-col gap-1.5">
                <Label>Source field</Label>
                <p className="text-xs text-muted-foreground">
                  The slug will be auto-generated from this field's value.
                </p>
                {stringFields.length > 0 ? (
                  <Select
                    value={config.targetField}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, targetField: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a text field" />
                    </SelectTrigger>
                    <SelectContent>
                      {stringFields.map((f) => (
                        <SelectItem key={f.name} value={f.name}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    No short text fields available. Add a string field first.
                  </p>
                )}
              </div>
            )}

            {selected?.type === 'relation' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Relation type</Label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {RELATION_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, relationType: opt.value }))}
                        className={`flex items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:border-primary ${
                          config.relationType === opt.value
                            ? 'border-primary bg-accent'
                            : 'border-border'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium leading-none">{opt.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Related content type</Label>
                  {availableContentTypes.length > 0 ? (
                    <Select
                      value={config.relatedTable}
                      onValueChange={(v) => {
                        const ct = availableContentTypes.find((c) => c.tableName === v)
                        setConfig((prev) => ({
                          ...prev,
                          relatedTable: v,
                          relatedSlug: ct?.slug ?? '',
                        }))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a content type" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableContentTypes.map((ct) => (
                          <SelectItem key={ct.tableName} value={ct.tableName}>
                            {ct.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="table_name"
                      value={config.relatedTable}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, relatedTable: e.target.value }))
                      }
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="field-required"
                checked={config.required}
                onCheckedChange={(val) =>
                  setConfig((prev) => ({ ...prev, required: Boolean(val) }))
                }
              />
              <Label htmlFor="field-required" className="cursor-pointer font-normal">
                Required field
              </Label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>{isEditing ? 'Save changes' : 'Add field'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
