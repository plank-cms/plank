import { type ContentType, ValidationError } from './types.js'

export function validate(
  contentType: ContentType,
  payload: Record<string, unknown>,
): void {
  const errors: string[] = []

  for (const field of contentType.fields) {
    const value = payload[field.name]
    const isEmpty = value === undefined || value === null || value === ''

    if (field.required && isEmpty) {
      errors.push(`Field "${field.name}" is required`)
      continue
    }

    if (isEmpty) continue

    switch (field.type) {
      case 'string':
      case 'text':
      case 'richtext':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`)
        }
        break
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`Field "${field.name}" must be a number`)
        } else if (field.subtype !== 'float' && !Number.isInteger(value)) {
          errors.push(`Field "${field.name}" must be an integer`)
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Field "${field.name}" must be a boolean`)
        }
        break
      case 'datetime':
        if (!(value instanceof Date) && isNaN(Date.parse(String(value)))) {
          errors.push(`Field "${field.name}" must be a valid date`)
        }
        break
      case 'media':
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`Field "${field.name}" must be a non-empty string URL`)
        }
        break
      case 'media-gallery':
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
          errors.push(`Field "${field.name}" must be an array of media IDs`)
        } else if (field.required && value.length === 0) {
          errors.push(`Field "${field.name}" is required`)
        }
        break
      case 'relation':
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`Field "${field.name}" must be a non-empty string ID`)
        }
        break
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.name}" must be an array`)
        } else if (field.required && value.length === 0) {
          errors.push(`Field "${field.name}" is required`)
        } else if (field.arrayFields && field.arrayFields.length > 0) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i] as Record<string, unknown>
            if (typeof item !== 'object' || item === null) {
              errors.push(`Field "${field.name}[${i}]" must be an object`)
              continue
            }
            for (const subField of field.arrayFields) {
              const subValue = item[subField.name]
              const subEmpty = subValue === undefined || subValue === null || subValue === ''
              if (subField.required && subEmpty) {
                errors.push(`Field "${field.name}[${i}].${subField.name}" is required`)
              }
            }
          }
        }
        break
    }
  }

  if (errors.length > 0) throw new ValidationError(errors)
}
