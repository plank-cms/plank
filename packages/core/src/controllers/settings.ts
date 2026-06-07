import type { Request, Response } from 'express'
import { pool } from '@plank-cms/db'
import { getSettings, setSettings } from '../lib/settings.js'
import { resolveAppModes } from '../lib/appModes.js'

// Sensitive fields are masked in GET responses — never returned to the client
const SENSITIVE_FIELDS: Record<string, Set<string>> = {
  media: new Set(['s3.secret_access_key', 'r2.secret_access_key']),
  mailing: new Set(['smtp.password']),
}

const MASKED = '••••••••'

function maskSettings(namespace: string, settings: Record<string, string>): Record<string, string> {
  const sensitive = SENSITIVE_FIELDS[namespace]
  if (!sensitive) return settings

  return Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, sensitive.has(k) && v ? MASKED : v]),
  )
}

export async function getNamespaceSettings(
  req: Request<{ namespace: string }>,
  res: Response,
): Promise<void> {
  const { namespace } = req.params
  if (namespace.startsWith('addon:')) {
    res.status(403).json({ error: 'Addon settings must be accessed through the add-ons API' })
    return
  }
  const settings = await getSettings(namespace)
  res.json(maskSettings(namespace, settings))
}

export async function getAppModes(req: Request, res: Response): Promise<void> {
  const modes = req.appModes ?? (await resolveAppModes())
  res.json(modes)
}

export async function getClientSettings(_req: Request, res: Response): Promise<void> {
  const [settings, previewSettings] = await Promise.all([
    getSettings('general'),
    getSettings('preview'),
  ])
  res.json({
    timezone: settings.timezone ?? 'UTC',
    locales: settings.locales ?? '["en"]',
    default_locale: settings.default_locale ?? 'en',
    preview_enabled: previewSettings.enabled ?? 'false',
    preview_sync_url: previewSettings.sync_url ?? '',
    preview_url_template: previewSettings.url_template ?? '',
    preview_slug_field: previewSettings.slug_field ?? 'slug',
  })
}

export async function getEditorialMode(_req: Request, res: Response): Promise<void> {
  const { editorial: enabled } = await resolveAppModes()
  res.json({ enabled })
}

export async function updateNamespaceSettings(
  req: Request<{ namespace: string }>,
  res: Response,
): Promise<void> {
  const { namespace } = req.params
  if (namespace.startsWith('addon:')) {
    res.status(403).json({ error: 'Addon settings must be accessed through the add-ons API' })
    return
  }
  const incoming = req.body as Record<string, string>

  if (typeof incoming !== 'object' || Array.isArray(incoming)) {
    res.status(400).json({ error: 'Body must be a flat key-value object' })
    return
  }

  const sensitive = SENSITIVE_FIELDS[namespace]
  const toSave: Record<string, string> = {}

  for (const [key, value] of Object.entries(incoming)) {
    // Skip sensitive fields that are empty or still masked — don't overwrite existing value
    if (sensitive?.has(key) && (!value || value === MASKED)) continue
    toSave[key] = value
  }

  await setSettings(namespace, toSave)

  if (
    namespace === 'general' &&
    Object.prototype.hasOwnProperty.call(toSave, 'editorial_mode') &&
    String(toSave.editorial_mode).toLowerCase() === 'false'
  ) {
    await pool.query(
      `UPDATE plank_users
       SET enabled = FALSE, session_version = session_version + 1
       WHERE role_id IN (
         SELECT id FROM plank_roles WHERE LOWER(name) IN ('editor', 'viewer')
       )`,
    )
  }

  const updated = await getSettings(namespace)
  res.json(maskSettings(namespace, updated))
}
