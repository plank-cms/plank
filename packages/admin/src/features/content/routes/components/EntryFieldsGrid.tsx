import { Label } from '@/shared/ui/label.tsx'
import { FieldInput } from '@/shared/components/content/FieldInput.tsx'
import type { FieldDef } from '@/shared/components/content/FieldInput.tsx'
import { FIELD_WIDTH_SPAN } from '@/shared/components/content-types/FieldCard.tsx'
import type { FieldWidth } from '@/shared/components/content-types/FieldCard.tsx'
import type { ContentType, LocalizedData } from '../entryTypes.ts'

type EntryFieldsGridProps = {
  ct: ContentType
  values: Record<string, unknown>
  id: string | undefined
  activeLocale: string
  localizationEnabled: boolean
  defaultLocale: string
  readOnly: boolean
  uidErrorField: string | null
  setUidErrorField: (field: string | null) => void
  handleLocalizedChange: (locale: string, name: string, value: unknown) => void
  handleChange: (name: string, value: unknown) => void
}

export function EntryFieldsGrid({
  ct,
  values,
  id,
  activeLocale,
  localizationEnabled,
  defaultLocale,
  readOnly,
  uidErrorField,
  setUidErrorField,
  handleLocalizedChange,
  handleChange,
}: EntryFieldsGridProps) {
  return (
    <div className="grid grid-cols-6 gap-4">
      {ct.fields.map((field) => {
        const isLocalizable = ['string', 'text', 'richtext'].includes(field.type)
        const localizedValue =
          values.localized && (values.localized as LocalizedData)[activeLocale]
            ? ((values.localized as LocalizedData)[activeLocale] as Record<string, unknown>)[
                field.name
              ]
            : undefined
        const renderValue =
          isLocalizable && localizationEnabled ? localizedValue : values[field.name]
        const uidDisabled =
          field.type === 'uid' &&
          field.targetField &&
          localizationEnabled &&
          ['string', 'text', 'richtext'].includes(
            ct.fields.find((f) => f.name === field.targetField)?.type ?? '',
          )

        return (
          <div
            key={field.name}
            className={FIELD_WIDTH_SPAN[(field.width as FieldWidth) ?? 'full']}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`entry-${field.name}`} className="capitalize">
                {field.name.replace(/_/g, ' ')}
                {field.required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <FieldInput
                field={field as FieldDef}
                value={renderValue}
                onChange={(value) => {
                  if (field.type === 'uid' && uidErrorField === field.name) {
                    setUidErrorField(null)
                  }
                  if (isLocalizable && localizationEnabled) {
                    handleLocalizedChange(activeLocale, field.name, value)
                  } else {
                    handleChange(field.name, value)
                  }
                }}
                allValues={{
                  ...values,
                  id,
                  __activeLocale: activeLocale,
                  __localizationEnabled: localizationEnabled,
                  __defaultLocale: defaultLocale,
                }}
                disabled={Boolean(uidDisabled) || readOnly}
                errorMessage={
                  field.type === 'uid' && uidErrorField === field.name
                    ? `${field.name} already exists.`
                    : undefined
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
