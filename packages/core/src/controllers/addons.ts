import type { Request, Response } from 'express'
import { z } from 'zod'
import { getSettings, setSettings } from '../lib/settings.js'
import {
  buildAdminAddonsRegistry,
  getAddonRow,
  listAddonRows,
  updateAddonEnabled,
} from '../lib/addons.js'

function mapAddon(row: NonNullable<Awaited<ReturnType<typeof getAddonRow>>>) {
  return {
    id: row.id,
    packageName: row.package_name,
    name: row.name,
    version: row.version ?? '',
    ...(row.description ? { description: row.description } : {}),
    installed: row.installed,
    enabled: row.enabled,
    compatible: row.compatible,
    hasAdminUi: row.has_admin_ui,
    ...(row.settings_namespace ? { settingsNamespace: row.settings_namespace } : {}),
  }
}

type SettingsAddon = NonNullable<Awaited<ReturnType<typeof getAddonRow>>> & {
  settings_namespace: string
}

async function getSettingsAddon(id: string) {
  const addon = await getAddonRow(id)
  if (!addon) return { error: 'Addon not found' as const }
  if (!addon.settings_namespace) return { error: 'Addon does not expose settings' as const }
  return { addon: addon as SettingsAddon }
}

export async function getAddonsRegistry(_req: Request, res: Response): Promise<void> {
  const registry = await buildAdminAddonsRegistry()
  res.json(registry)
}

export async function listAddons(_req: Request, res: Response): Promise<void> {
  const addons = await listAddonRows()
  res.json(addons.map(mapAddon))
}

export async function enableAddon(req: Request<{ id: string }>, res: Response): Promise<void> {
  const addon = await getAddonRow(req.params.id)
  if (!addon) {
    res.status(404).json({ error: 'Addon not found' })
    return
  }

  if (!addon.installed) {
    res.status(409).json({ error: 'Addon is not installed' })
    return
  }

  if (!addon.compatible) {
    res.status(409).json({ error: 'Addon is not compatible with this Plank version' })
    return
  }

  const updated = await updateAddonEnabled(req.params.id, true)
  res.json(mapAddon(updated!))
}

export async function disableAddon(req: Request<{ id: string }>, res: Response): Promise<void> {
  const addon = await getAddonRow(req.params.id)
  if (!addon) {
    res.status(404).json({ error: 'Addon not found' })
    return
  }

  const updated = await updateAddonEnabled(req.params.id, false)
  res.json(mapAddon(updated!))
}

export async function getAddonSettings(req: Request<{ id: string }>, res: Response): Promise<void> {
  const result = await getSettingsAddon(req.params.id)
  if ('error' in result) {
    res.status(result.error === 'Addon not found' ? 404 : 400).json({ error: result.error })
    return
  }

  const settings = await getSettings(result.addon.settings_namespace)
  res.json(settings)
}

export async function updateAddonSettings(req: Request<{ id: string }>, res: Response): Promise<void> {
  const result = await getSettingsAddon(req.params.id)
  if ('error' in result) {
    res.status(result.error === 'Addon not found' ? 404 : 400).json({ error: result.error })
    return
  }

  const parsed = z.record(z.string(), z.string()).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Body must be a flat key-value object' })
    return
  }

  await setSettings(result.addon.settings_namespace, parsed.data)
  const settings = await getSettings(result.addon.settings_namespace)
  res.json(settings)
}
