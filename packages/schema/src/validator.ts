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
      case 'relation':
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`Field "${field.name}" must be a non-empty string ID`)
        }
        break
    }
  }

  if (errors.length > 0) throw new ValidationError(errors)
}
