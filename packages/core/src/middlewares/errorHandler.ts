import type { Request, Response, NextFunction } from 'express'
import { ValidationError, SchemaError } from '@plank-cms/schema'
import { EntryError } from '../services/entries.js'
import { ZodError, flattenError } from 'zod'

type PostgresError = {
  code?: string
  detail?: string
}

function parseUniqueViolationField(detail: string | undefined): string | null {
  if (!detail) return null
  const match = detail.match(/Key \(([^)]+)\)=\(([^)]*)\) already exists\./)
  if (!match) return null
  const field = match[1]?.trim()
  if (!field || field.includes(',')) return null
  return field
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof EntryError) {
    res.status(err.status).json({ error: err.message })
    return
  }

  if (err instanceof ValidationError) {
    res.status(400).json({ errors: err.errors })
    return
  }

  if (err instanceof SchemaError) {
    res.status(400).json({ error: err.message })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({ errors: flattenError(err, (i) => i.message) })
    return
  }

  const pgErr = err as PostgresError
  if (pgErr?.code === '23505') {
    const field = parseUniqueViolationField(pgErr.detail)
    res
      .status(409)
      .json({ error: field ? `Field "${field}" already exists.` : 'Unique value already exists.' })
    return
  }

  console.error('[plank] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
