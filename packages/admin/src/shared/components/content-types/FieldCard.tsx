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
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
  LayoutListIcon,
  ListTreeIcon,
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
  | 'media-gallery'
  | 'relation'
  | 'uid'
  | 'array'
  | 'navigation'
type NumberSubtype = 'integer' | 'float'
export type FieldWidth = 'full' | 'two-thirds' | 'half' | 'third'
export type MediaAllowedType = 'image' | 'video' | 'audio' | 'document'
export type RelationType = 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'
export type ArraySubFieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'media'
  | 'mixed'
export type ArraySubField = {
  name: string
  type: ArraySubFieldType
  required?: boolean
  subtype?: NumberSubtype
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
}

export type FieldCardData = {
  name: string
  type: FieldType
  required?: boolean
  subtype?: NumberSubtype
  relationType?: RelationType
  relatedTable?: string
  relatedSlug?: string
  relatedField?: string
  targetField?: string
  allowedTypes?: MediaAllowedType[]
  width?: FieldWidth
  arrayFields?: ArraySubField[]
}

type FieldMeta = {
  icon: LucideIcon
  label: string
  color: string
  bg: string
}

function getFieldMeta(type: FieldType | ArraySubFieldType, subtype?: NumberSubtype): FieldMeta {
  switch (type) {
    case 'string':
      return { icon: TypeIcon, label: 'Text (string)', color: 'text-blue-600', bg: 'bg-blue-50' }
    case 'text':
      return {
        icon: AlignLeftIcon,
        label: 'Long text (string)',
        color: 'text-sky-600',
        bg: 'bg-sky-50',
      }
    case 'richtext':
      return {
        icon: FileTextIcon,
        label: 'Rich text (blocks)',
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
        label: 'Date & time',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      }
    case 'media':
      return { icon: ImageIcon, label: 'Media', color: 'text-rose-600', bg: 'bg-rose-50' }
    case 'mixed':
      return { icon: LayoutListIcon, label: 'Mixed value', color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' }
    case 'media-gallery':
      return {
        icon: LayoutGridIcon,
        label: 'Media Gallery',
        color: 'text-pink-600',
        bg: 'bg-pink-50',
      }
    case 'relation':
      return { icon: LinkIcon, label: 'Relation', color: 'text-indigo-600', bg: 'bg-indigo-50' }
    case 'uid':
      return { icon: FingerprintIcon, label: 'UID', color: 'text-teal-600', bg: 'bg-teal-50' }
    case 'array':
      return { icon: LayoutListIcon, label: 'Array', color: 'text-cyan-600', bg: 'bg-cyan-50' }
    case 'navigation':
      return { icon: ListTreeIcon, label: 'Navigation', color: 'text-cyan-600', bg: 'bg-cyan-50' }
  }
}

export const FIELD_WIDTH_SPAN: Record<FieldWidth, string> = {
  full: 'col-span-6',
  'two-thirds': 'col-span-4',
  half: 'col-span-3',
  third: 'col-span-2',
}

export const DEFAULT_FIELD_WIDTH: Record<FieldType, FieldWidth> = {
  string: 'half',
  text: 'full',
  richtext: 'full',
  number: 'third',
  boolean: 'third',
  datetime: 'half',
  media: 'half',
  'media-gallery': 'full',
  relation: 'half',
  uid: 'half',
  array: 'full',
  navigation: 'full',
}

function WidthIcon({ width }: { width: FieldWidth }) {
  const bar = 'rounded-sm bg-current'
  if (width === 'full')
    return (
      <div className="flex w-4 gap-px">
        <div className={`${bar} h-2 w-full`} />
      </div>
    )
  if (width === 'two-thirds')
    return (
      <div className="flex w-4 gap-px">
        <div className={`${bar} h-2 flex-1`} />
        <div className={`${bar} h-2 flex-1`} />
        <div className="h-2 flex-1 rounded-sm bg-current opacity-25" />
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
      <div className="h-2 flex-1 rounded-sm bg-current opacity-25" />
      <div className="h-2 flex-1 rounded-sm bg-current opacity-25" />
    </div>
  )
}

const WIDTH_OPTIONS: { value: FieldWidth; label: string }[] = [
  { value: 'full', label: 'Full width' },
  { value: 'half', label: 'Half' },
  { value: 'third', label: '1/3' },
  { value: 'two-thirds', label: '2/3' },
]

type FieldCardProps = {
  field: FieldCardData
  onWidthChange?: (width: FieldWidth) => void
  onArraySubFieldWidthChange?: (subFieldName: string, width: FieldWidth) => void
  onEdit?: () => void
  onDelete?: () => void
  dragListeners?: DraggableSyntheticListeners
  dragAttributes?: React.HTMLAttributes<HTMLElement>
}

export function FieldCard({
  field,
  onWidthChange,
  onArraySubFieldWidthChange,
  onEdit,
  onDelete,
  dragListeners,
  dragAttributes,
}: FieldCardProps) {
  const { icon: Icon, label, color, bg } = getFieldMeta(field.type, field.subtype)
  const currentWidth = field.width ?? 'full'
  const isDraggable = Boolean(dragListeners)
  const isArray = field.type === 'array'

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center gap-2 px-3 py-3">
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
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium leading-tight">
              {field.name}
              {field.required && <span className="ml-1 text-destructive">*</span>}
            </p>
            {field.relationType === 'one-to-many' && (
              <span className="shrink-0 rounded border border-indigo-200 bg-indigo-50 px-1 py-px text-[10px] font-medium text-indigo-600">
                Auto
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {field.relationType === 'one-to-many' ? 'Inverse relation · read-only' : label}
          </p>
        </div>

        {onWidthChange && !isArray && (
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

      {isArray && field.arrayFields && field.arrayFields.length > 0 && (
        <div className="grid grid-cols-6 gap-2 px-3 pb-3">
          {field.arrayFields.map((subField) => {
            const subMeta = getFieldMeta(subField.type as FieldType, subField.subtype)
            const SubIcon = subMeta.icon
            return (
              <div
                key={subField.name}
                className={`${FIELD_WIDTH_SPAN[subField.width ?? 'full']} rounded-md border border-dashed border-border p-2`}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex size-5 shrink-0 items-center justify-center rounded ${subMeta.bg}`}
                  >
                    <SubIcon className={`size-3 ${subMeta.color}`} />
                  </div>
                  <span className="truncate text-xs font-medium">
                    {subField.name}
                    {subField.required && <span className="ml-0.5 text-destructive">*</span>}
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-6 text-[10px] text-muted-foreground">
                  {subMeta.label}
                </p>
                {onArraySubFieldWidthChange && (
                  <div className="mt-1 flex items-center gap-px rounded-md border border-border p-0.5">
                    {WIDTH_OPTIONS.map(({ value, label: tooltip }) => (
                      <button
                        key={value}
                        type="button"
                        title={tooltip}
                        onClick={() => onArraySubFieldWidthChange(subField.name, value)}
                        className={[
                          'flex items-center justify-center rounded px-1.5 py-1 transition-colors',
                          (subField.width ?? 'full') === value
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:text-foreground',
                        ].join(' ')}
                      >
                        <WidthIcon width={value} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
