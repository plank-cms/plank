import { type ContentType, ValidationError } from './types.js'

const MAX_NAVIGATION_DEPTH = 3
const MAX_NAVIGATION_ITEMS_PER_LEVEL = 20

type MixedArrayValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }

function isMixedArrayValue(value: unknown): value is MixedArrayValue {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'string') return typeof v.value === 'string'
  if (v.kind === 'number') return typeof v.value === 'number' && !isNaN(v.value)
  if (v.kind === 'boolean') return typeof v.value === 'boolean'
  return false
}

function validateNavigationItems(
  value: unknown,
  fieldName: string,
  errors: string[],
  path = fieldName,
  depth = 1,
): void {
  if (!Array.isArray(value)) {
    errors.push(`Field "${path}" must be an array`)
    return
  }

  if (depth > MAX_NAVIGATION_DEPTH) {
    errors.push(`Field "${path}" exceeds max navigation depth (${MAX_NAVIGATION_DEPTH})`)
    return
  }

  if (value.length > MAX_NAVIGATION_ITEMS_PER_LEVEL) {
    errors.push(
      `Field "${path}" cannot have more than ${MAX_NAVIGATION_ITEMS_PER_LEVEL} items per level`,
    )
  }

  for (let i = 0; i < value.length; i++) {
    const item = value[i] as Record<string, unknown>
    const itemPath = `${path}[${i}]`
    if (typeof item !== 'object' || item === null) {
      errors.push(`Field "${itemPath}" must be an object`)
      continue
    }

    if (typeof item.label !== 'string' || !item.label.trim()) {
      errors.push(`Field "${itemPath}.label" must be a non-empty string`)
    }
    if (typeof item.href !== 'string' || !item.href.trim()) {
      errors.push(`Field "${itemPath}.href" must be a non-empty string`)
    }
    if (item.items !== undefined) {
      validateNavigationItems(item.items, fieldName, errors, `${itemPath}.items`, depth + 1)
    }
  }
}

export function validate(
  contentType: ContentType,
  payload: Record<string, unknown>,
): void {
  const errors: string[] = []

  for (const field of contentType.fields) {
    if (field.type === 'separator') continue

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
      case 'relation': {
        const rt = field.relationType ?? 'many-to-one'
        if (rt === 'one-to-many') break // read-only, never sent by client
        if (rt === 'many-to-many') {
          if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
            errors.push(`Field "${field.name}" must be an array of IDs`)
          } else if (field.required && value.length === 0) {
            errors.push(`Field "${field.name}" is required`)
          }
        } else {
          if (typeof value !== 'string' || !value.trim()) {
            errors.push(`Field "${field.name}" must be a non-empty string ID`)
          }
        }
        break
      }
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
                continue
              }
              if (subEmpty) continue

              if (subField.type === 'string' || subField.type === 'text' || subField.type === 'richtext') {
                if (typeof subValue !== 'string') {
                  errors.push(`Field "${field.name}[${i}].${subField.name}" must be a string`)
                }
              } else if (subField.type === 'number') {
                if (typeof subValue !== 'number' || isNaN(subValue)) {
                  errors.push(`Field "${field.name}[${i}].${subField.name}" must be a number`)
                } else if (subField.subtype !== 'float' && !Number.isInteger(subValue)) {
                  errors.push(`Field "${field.name}[${i}].${subField.name}" must be an integer`)
                }
              } else if (subField.type === 'boolean') {
                if (typeof subValue !== 'boolean') {
                  errors.push(`Field "${field.name}[${i}].${subField.name}" must be a boolean`)
                }
              } else if (subField.type === 'datetime') {
                if (!(subValue instanceof Date) && isNaN(Date.parse(String(subValue)))) {
                  errors.push(`Field "${field.name}[${i}].${subField.name}" must be a valid date`)
                }
              } else if (subField.type === 'media') {
                if (typeof subValue !== 'string' || !subValue.trim()) {
                  errors.push(
                    `Field "${field.name}[${i}].${subField.name}" must be a non-empty media reference string`,
                  )
                }
              } else if (subField.type === 'mixed') {
                if (!isMixedArrayValue(subValue)) {
                  errors.push(
                    `Field "${field.name}[${i}].${subField.name}" must be a mixed value object with kind/value`,
                  )
                }
              }
            }
          }
        }
        break
      case 'table':
        if (!Array.isArray(value)) {
          errors.push(`Field "${field.name}" must be an array of rows`)
        } else if (field.required && value.length === 0) {
          errors.push(`Field "${field.name}" is required`)
        } else {
          const columns = field.tableColumns ?? 1
          for (const [index, row] of value.entries()) {
            if (
              !Array.isArray(row) ||
              row.length !== columns ||
              row.some((cell) => typeof cell !== 'string')
            ) {
              errors.push(`Field "${field.name}[${index}]" must contain ${columns} text cells`)
            }
          }
        }
        break
      case 'navigation':
        if (field.required && Array.isArray(value) && value.length === 0) {
          errors.push(`Field "${field.name}" is required`)
          break
        }
        validateNavigationItems(value, field.name, errors)
        break
    }
  }

  if (errors.length > 0) throw new ValidationError(errors)
}
