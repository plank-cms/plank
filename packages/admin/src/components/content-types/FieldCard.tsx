import {
  TypeIcon,
  AlignLeftIcon,
  FileTextIcon,
  HashIcon,
  ToggleLeftIcon,
  CalendarIcon,
  ImageIcon,
  LinkIcon,
  FingerprintIcon,
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'

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
type NumberSubtype = 'integer' | 'float'
export type FieldWidth = 'full' | 'half' | 'third'

export type MediaAllowedType = 'image' | 'video' | 'audio' | 'document'

export type FieldCardData = {
  name: string
  type: FieldType
  required?: boolean
  subtype?: NumberSubtype
  relatedTable?: string
  targetField?: string
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
}

type FieldMeta = {
  icon: LucideIcon
  label: string
  color: string
  bg: string
}

function getFieldMeta(type: FieldType, subtype?: NumberSubtype): FieldMeta {
  switch (type) {
    case 'string':
      return { icon: TypeIcon, label: 'Text (string)', color: 'text-blue-600', bg: 'bg-blue-50' }
    case 'text':
      return { icon: AlignLeftIcon, label: 'Long text (string)', color: 'text-sky-600', bg: 'bg-sky-50' }
    case 'richtext':
      return {
        icon: FileTextIcon,
        label: 'Rich text (string)',
        color: 'text-violet-600',
        bg: 'bg-violet-50',
      }
    case 'number':
      return {
        icon: HashIcon,
        label: subtype === 'float' ? 'Decimal (number)' : 'Integer (number)',
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      }
    case 'boolean':
      return {
        icon: ToggleLeftIcon,
        label: 'Boolean',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
      }
    case 'datetime':
      return {
        icon: CalendarIcon,
        label: 'Date & time (datetime)',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      }
    case 'media':
      return { icon: ImageIcon, label: 'Media', color: 'text-rose-600', bg: 'bg-rose-50' }
    case 'relation':
      return { icon: LinkIcon, label: 'Relation', color: 'text-indigo-600', bg: 'bg-indigo-50' }
    case 'uid':
      return { icon: FingerprintIcon, label: 'UID', color: 'text-teal-600', bg: 'bg-teal-50' }
  }
}

export const FIELD_WIDTH_SPAN: Record<FieldWidth, string> = {
  full: 'col-span-6',
  half: 'col-span-3',
  third: 'col-span-2',
}

function WidthIcon({ width }: { width: FieldWidth }) {
  const bar = 'rounded-sm bg-current'
  if (width === 'full')
    return (
      <div className="flex w-4 gap-px">
        <div className={`${bar} h-2 w-full`} />
      </div>
    )
  if (width === 'half')
    return (
      <div className="flex w-4 gap-px">
        <div className={`${bar} h-2 flex-1`} />
        <div className={`${bar} h-2 flex-1`} />
      </div>
    )
  return (
    <div className="flex w-4 gap-px">
      <div className={`${bar} h-2 flex-1`} />
      <div className={`${bar} h-2 flex-1`} />
      <div className={`${bar} h-2 flex-1`} />
    </div>
  )
}

const WIDTH_OPTIONS: { value: FieldWidth; label: string }[] = [
  { value: 'full', label: 'Full width' },
  { value: 'half', label: 'Half' },
  { value: 'third', label: '1/3' },
]

type FieldCardProps = {
  field: FieldCardData
  onWidthChange?: (width: FieldWidth) => void
  onEdit?: () => void
  onDelete?: () => void
  dragListeners?: DraggableSyntheticListeners
  dragAttributes?: React.HTMLAttributes<HTMLElement>
}

export function FieldCard({
  field,
  onWidthChange,
  onEdit,
  onDelete,
  dragListeners,
  dragAttributes,
}: FieldCardProps) {
  const { icon: Icon, label, color, bg } = getFieldMeta(field.type, field.subtype)
  const currentWidth = field.width ?? 'full'
  const isDraggable = Boolean(dragListeners)

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 shadow-xs">
      {isDraggable && (
        <button
          type="button"
          className="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          {...dragListeners}
          {...dragAttributes}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}

      <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
        <Icon className={`size-4 ${color}`} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {field.name}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>

      {onWidthChange && (
        <div className="flex shrink-0 items-center gap-px rounded-md border border-border p-0.5">
          {WIDTH_OPTIONS.map(({ value, label: tooltip }) => (
            <button
              key={value}
              type="button"
              title={tooltip}
              onClick={() => onWidthChange(value)}
              className={[
                'flex items-center justify-center rounded px-1.5 py-1 transition-colors',
                currentWidth === value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <WidthIcon width={value} />
            </button>
          ))}
        </div>
      )}

      {(onEdit || onDelete) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit && (
            <button
              type="button"
              title="Edit field"
              onClick={onEdit}
              className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <PencilIcon className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              title="Delete field"
              onClick={onDelete}
              className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
