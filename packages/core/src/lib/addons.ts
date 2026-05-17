import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '@plank-cms/db'
import {
  findAllContentTypes,
  findContentTypeBySlug,
  quoteIdentifier,
} from '@plank-cms/schema'
import { getProvider } from '../media/index.js'
import { z } from 'zod'
import { getSettings } from './settings.js'
import { getCurrentVersion } from './version.js'

const ADDON_PACKAGE_PREFIX = '@plank-cms/addon-'

function getHostRequire() {
  return createRequire(join(process.cwd(), 'package.json'))
}

const addonSlotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().optional(),
})

const addonManifestSchema = z.object({
  id: z.string().min(1),
  packageName: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  plankRange: z.string().min(1),
  description: z.string().optional(),
  settingsNamespace: z.string().min(1).optional(),
  slots: z.object({
    dashboardWidgets: z.array(addonSlotSchema).optional(),
    addonsSections: z.array(addonSlotSchema).optional(),
  }),
  admin: z.object({
    entry: z.string().min(1),
  }).optional(),
})

type PackageJson = {
  name?: string
  version?: string
  description?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

type ManifestSlot = z.infer<typeof addonSlotSchema>
type PlankAddonManifest = z.infer<typeof addonManifestSchema>

type NormalizedAddonSlots = {
  dashboardWidgets: ManifestSlot[]
  addonsSections: ManifestSlot[]
}

type DiscoveredAddon = {
  id: string
  packageName: string
  name: string
  version: string | null
  plankRange: string | null
  description: string | null
  installed: boolean
  enabled: boolean
  compatible: boolean
  hasAdminUi: boolean
  settingsNamespace: string | null
  slots: NormalizedAddonSlots
}

type AddonRow = {
  id: string
  package_name: string
  name: string
  version: string | null
  plank_range: string | null
  description: string | null
  installed: boolean
  enabled: boolean
  compatible: boolean
  has_admin_ui: boolean
  settings_namespace: string | null
  slots_json: NormalizedAddonSlots | null
}

export type AdminAddonRegistryItem = {
  id: string
  packageName: string
  name: string
  version: string
  description?: string
  installed: boolean
  enabled: boolean
  compatible: boolean
  hasAdminUi: boolean
  settingsNamespace?: string
  adminUrl?: string
}

export type AdminAddonSlotItem = {
  addonId: string
  slotId: string
  title: string
  order: number
}

export type AdminAddonsRegistryResponse = {
  addons: AdminAddonRegistryItem[]
  slots: {
    dashboardWidgets: AdminAddonSlotItem[]
    addonsSections: AdminAddonSlotItem[]
  }
}

const addonAdminFieldSchema = z.discriminatedUnion('type', [
  z.object({
    key: z.string().min(1),
    type: z.literal('contentTypesMultiSelect'),
    label: z.string().min(1),
    description: z.string().min(1),
    defaultValue: z.array(z.string()),
  }),
  z.object({
    key: z.string().min(1),
    type: z.literal('number'),
    label: z.string().min(1),
    description: z.string().min(1),
    min: z.number(),
    defaultValue: z.number(),
  }),
])

const addonAdminModuleSchema = z.object({
  addonId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  settingsNamespace: z.string().min(1),
  checks: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
  })),
  settings: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    fields: z.array(addonAdminFieldSchema),
  }),
})

export type AddonAdminField = z.infer<typeof addonAdminFieldSchema>
export type AddonAdminModule = z.infer<typeof addonAdminModuleSchema>

export type AddonServerActionContext = {
  db: {
    query: typeof pool.query
  }
  media: {
    getUrl: (key: string) => Promise<string>
  }
  getSettings: typeof getSettings
  findAllContentTypes: typeof findAllContentTypes
  findContentTypeBySlug: typeof findContentTypeBySlug
  quoteIdentifier: typeof quoteIdentifier
}

export type AddonServerModule = {
  runAction: (args: {
    action: string
    input: unknown
    addon: {
      id: string
      packageName: string
      settingsNamespace: string | null
    }
    context: AddonServerActionContext
  }) => Promise<unknown>
}

function normalizeSlot(slot: ManifestSlot): ManifestSlot {
  return {
    id: slot.id,
    title: slot.title,
    order: slot.order ?? 100,
  }
}

function compareSlotOrder(left: ManifestSlot, right: ManifestSlot): number {
  if ((left.order ?? 100) !== (right.order ?? 100)) {
    return (left.order ?? 100) - (right.order ?? 100)
  }

  return left.id.localeCompare(right.id)
}

function normalizeAddonSlots(manifest: PlankAddonManifest): NormalizedAddonSlots {
  const dashboardWidgets = (manifest.slots.dashboardWidgets ?? [])
    .map(normalizeSlot)
    .sort(compareSlotOrder)
  const addonsSections = manifest.admin?.entry
    ? (manifest.slots.addonsSections ?? []).map(normalizeSlot).sort(compareSlotOrder)
    : []

  return {
    dashboardWidgets,
    addonsSections,
  }
}

function createFallbackAddonId(packageName: string): string {
  return packageName.startsWith(ADDON_PACKAGE_PREFIX)
    ? packageName.slice(ADDON_PACKAGE_PREFIX.length)
    : packageName
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolvePackageJsonPath(packageName: string): Promise<string | null> {
  const hostRequire = getHostRequire()

  try {
    return hostRequire.resolve(`${packageName}/package.json`)
  } catch {
    try {
      const entryPath = hostRequire.resolve(packageName)
      let currentDir = dirname(entryPath)

      for (;;) {
        const candidate = join(currentDir, 'package.json')
        if (await pathExists(candidate)) {
          return candidate
        }

        const parentDir = dirname(currentDir)
        if (parentDir === currentDir) return null
        currentDir = parentDir
      }
    } catch {
      return null
    }
  }
}

async function resolvePackageRoot(packageName: string): Promise<string | null> {
  const packageJsonPath = await resolvePackageJsonPath(packageName)
  if (packageJsonPath) return dirname(packageJsonPath)

  try {
    const manifestUrl = import.meta.resolve(`${packageName}/plank`)
    let currentDir = dirname(fileURLToPath(manifestUrl))

    for (;;) {
      const candidate = join(currentDir, 'package.json')
      if (await pathExists(candidate)) {
        return currentDir
      }

      const parentDir = dirname(currentDir)
      if (parentDir === currentDir) return null
      currentDir = parentDir
    }
  } catch {
    return null
  }
}

async function readInstalledPackageJson(packageName: string): Promise<PackageJson | null> {
  const packageJsonPath = await resolvePackageJsonPath(packageName)
  if (!packageJsonPath) return null

  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    return JSON.parse(raw) as PackageJson
  } catch {
    return null
  }
}

async function readHostPackageJson(): Promise<PackageJson> {
  const raw = await readFile(join(process.cwd(), 'package.json'), 'utf8')
  return JSON.parse(raw) as PackageJson
}

function listDeclaredAddonPackages(packageJson: PackageJson): string[] {
  return Array.from(
    new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ]),
  )
    .filter((packageName) => packageName.startsWith(ADDON_PACKAGE_PREFIX))
    .sort()
}

function normalizeVersion(value: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = value
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

  return [major, minor, patch]
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left)
  const rightParts = normalizeVersion(right)

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }

  return 0
}

function buildCaretUpperBound(version: string): string {
  const [major, minor, patch] = normalizeVersion(version)

  if (major > 0) return `${major + 1}.0.0`
  if (minor > 0) return `0.${minor + 1}.0`
  return `0.0.${patch + 1}`
}

function buildTildeUpperBound(version: string): string {
  const [major, minor] = normalizeVersion(version)
  return `${major}.${minor + 1}.0`
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const value = comparator.trim()
  if (!value) return true

  if (value.startsWith('>=')) return compareVersions(version, value.slice(2)) >= 0
  if (value.startsWith('<=')) return compareVersions(version, value.slice(2)) <= 0
  if (value.startsWith('>')) return compareVersions(version, value.slice(1)) > 0
  if (value.startsWith('<')) return compareVersions(version, value.slice(1)) < 0

  if (value.startsWith('^')) {
    const lower = value.slice(1)
    return compareVersions(version, lower) >= 0
      && compareVersions(version, buildCaretUpperBound(lower)) < 0
  }

  if (value.startsWith('~')) {
    const lower = value.slice(1)
    return compareVersions(version, lower) >= 0
      && compareVersions(version, buildTildeUpperBound(lower)) < 0
  }

  return compareVersions(version, value) === 0
}

function satisfiesVersionRange(version: string, range: string): boolean {
  const normalizedRange = range.trim()
  if (!normalizedRange || normalizedRange === '*') return true

  return normalizedRange
    .split('||')
    .some((part) => part.trim().split(/\s+/).every((token) => satisfiesComparator(version, token)))
}

async function loadAddonManifest(packageName: string): Promise<PlankAddonManifest> {
  const module = await import(`${packageName}/plank`)
  const parsed = addonManifestSchema.safeParse(module?.manifest)

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(', '))
  }

  if (parsed.data.packageName !== packageName) {
    throw new Error(`Manifest packageName mismatch for ${packageName}`)
  }

  return parsed.data
}

async function loadAddonAdminModule(packageName: string): Promise<AddonAdminModule> {
  const module = await import(`${packageName}/admin`)
  const candidate = module?.adminModule ?? module?.default
  const parsed = addonAdminModuleSchema.safeParse(candidate)

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(', '))
  }

  return parsed.data
}

async function loadAddonServerModule(packageName: string): Promise<AddonServerModule> {
  const module = await import(`${packageName}/server`)
  const candidate = module?.serverModule ?? module?.default

  if (!candidate || typeof candidate.runAction !== 'function') {
    throw new Error(`Invalid server module for ${packageName}`)
  }

  return candidate as AddonServerModule
}

async function resolveAddonAdminEntryPath(packageName: string): Promise<string | null> {
  const [manifest, packageRoot] = await Promise.all([
    loadAddonManifest(packageName),
    resolvePackageRoot(packageName),
  ])

  if (!manifest.admin?.entry || !packageRoot) return null

  const entryPath = resolve(packageRoot, manifest.admin.entry)
  if (!entryPath.startsWith(packageRoot)) {
    throw new Error(`Invalid admin entry path for ${packageName}`)
  }

  if (!(await pathExists(entryPath))) {
    throw new Error(`Admin entry file not found for ${packageName}: ${entryPath}`)
  }

  return entryPath
}

async function discoverAddon(packageName: string, coreVersion: string): Promise<DiscoveredAddon | null> {
  const packageJson = await readInstalledPackageJson(packageName)

  try {
    const manifest = await loadAddonManifest(packageName)
    const compatible = satisfiesVersionRange(coreVersion, manifest.plankRange)

    return {
      id: manifest.id,
      packageName,
      name: manifest.name,
      version: manifest.version,
      plankRange: manifest.plankRange,
      description: manifest.description ?? packageJson?.description ?? null,
      installed: true,
      enabled: false,
      compatible,
      hasAdminUi: Boolean(manifest.admin?.entry),
      settingsNamespace: manifest.settingsNamespace ?? null,
      slots: normalizeAddonSlots(manifest),
    }
  } catch (error) {
    const fallbackId = createFallbackAddonId(packageName)
    const message = error instanceof Error ? error.message : 'Unknown manifest error'

    console.warn(`[plank/addons] Skipping invalid add-on manifest for ${packageName}: ${message}`)

    return {
      id: fallbackId,
      packageName,
      name: packageJson?.name ?? fallbackId,
      version: packageJson?.version ?? null,
      plankRange: null,
      description: packageJson?.description ?? null,
      installed: true,
      enabled: false,
      compatible: false,
      hasAdminUi: false,
      settingsNamespace: null,
      slots: {
        dashboardWidgets: [],
        addonsSections: [],
      },
    }
  }
}

export async function syncInstalledAddons(): Promise<void> {
  const hostPackageJson = await readHostPackageJson()
  const packageNames = listDeclaredAddonPackages(hostPackageJson)
  const coreVersion = await getCurrentVersion()

  const discovered = (
    await Promise.all(packageNames.map((packageName) => discoverAddon(packageName, coreVersion)))
  ).filter((addon): addon is DiscoveredAddon => addon !== null)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const addon of discovered) {
      await client.query(
        `INSERT INTO plank_addons (
           id,
           package_name,
           name,
           version,
           plank_range,
           description,
           installed,
           compatible,
           has_admin_ui,
           settings_namespace,
           slots_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           package_name = EXCLUDED.package_name,
           name = EXCLUDED.name,
           version = EXCLUDED.version,
           plank_range = EXCLUDED.plank_range,
           description = EXCLUDED.description,
           installed = EXCLUDED.installed,
           compatible = EXCLUDED.compatible,
           has_admin_ui = EXCLUDED.has_admin_ui,
           settings_namespace = EXCLUDED.settings_namespace,
           slots_json = EXCLUDED.slots_json,
           updated_at = NOW()`,
        [
          addon.id,
          addon.packageName,
          addon.name,
          addon.version,
          addon.plankRange,
          addon.description,
          addon.compatible,
          addon.hasAdminUi,
          addon.settingsNamespace,
          JSON.stringify(addon.slots),
        ],
      )
    }

    if (packageNames.length > 0) {
      await client.query(
        `UPDATE plank_addons
         SET installed = FALSE,
             compatible = FALSE,
             has_admin_ui = FALSE,
             slots_json = '{}'::jsonb,
             updated_at = NOW()
         WHERE package_name LIKE $1
           AND package_name <> ALL($2::text[])`,
        [`${ADDON_PACKAGE_PREFIX}%`, packageNames],
      )
    } else {
      await client.query(
        `UPDATE plank_addons
         SET installed = FALSE,
             compatible = FALSE,
             has_admin_ui = FALSE,
             slots_json = '{}'::jsonb,
             updated_at = NOW()
         WHERE package_name LIKE $1`,
        [`${ADDON_PACKAGE_PREFIX}%`],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function normalizeSlotsFromRow(value: NormalizedAddonSlots | null | undefined): NormalizedAddonSlots {
  return {
    dashboardWidgets: Array.isArray(value?.dashboardWidgets) ? value.dashboardWidgets : [],
    addonsSections: Array.isArray(value?.addonsSections) ? value.addonsSections : [],
  }
}

function mapAddonRow(row: AddonRow): AdminAddonRegistryItem {
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
    ...(row.has_admin_ui ? { adminUrl: `/admin/add-ons/${row.id}` } : {}),
  }
}

export async function listAddonRows(): Promise<AddonRow[]> {
  const { rows } = await pool.query<AddonRow>(
    `SELECT
       id,
       package_name,
       name,
       version,
       plank_range,
       description,
       installed,
       enabled,
       compatible,
       has_admin_ui,
       settings_namespace,
       slots_json
     FROM plank_addons
     ORDER BY name ASC, id ASC`,
  )

  return rows
}

export async function getAddonRow(id: string): Promise<AddonRow | null> {
  const { rows } = await pool.query<AddonRow>(
    `SELECT
       id,
       package_name,
       name,
       version,
       plank_range,
       description,
       installed,
       enabled,
       compatible,
       has_admin_ui,
       settings_namespace,
       slots_json
     FROM plank_addons
     WHERE id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export async function getAddonAdminModule(id: string): Promise<AddonAdminModule | null> {
  const addon = await getAddonRow(id)
  if (!addon || !addon.installed || !addon.has_admin_ui) return null

  try {
    return await loadAddonAdminModule(addon.package_name)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown admin module error'
    console.warn(`[plank/addons] Failed to load admin module for ${addon.package_name}: ${message}`)
    return null
  }
}

export async function getAddonAdminEntryPath(id: string): Promise<string | null> {
  const addon = await getAddonRow(id)
  if (!addon || !addon.installed || !addon.has_admin_ui) return null

  try {
    return await resolveAddonAdminEntryPath(addon.package_name)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown admin entry error'
    console.warn(`[plank/addons] Failed to resolve admin entry for ${addon.package_name}: ${message}`)
    return null
  }
}

export async function runAddonServerAction(
  id: string,
  action: string,
  input: unknown,
): Promise<unknown> {
  const addon = await getAddonRow(id)
  if (!addon) {
    throw new Error('Addon not found')
  }

  if (!addon.installed) {
    throw new Error('Addon is not installed')
  }

  if (!addon.enabled) {
    throw new Error('Addon is disabled')
  }

  if (!addon.compatible) {
    throw new Error('Addon is not compatible with this Plank version')
  }

  const serverModule = await loadAddonServerModule(addon.package_name)
  const mediaProvider = await getProvider()

  return serverModule.runAction({
    action,
    input,
    addon: {
      id: addon.id,
      packageName: addon.package_name,
      settingsNamespace: addon.settings_namespace,
    },
    context: {
      db: {
        query: pool.query.bind(pool),
      },
      media: {
        getUrl: mediaProvider.getUrl.bind(mediaProvider),
      },
      getSettings,
      findAllContentTypes,
      findContentTypeBySlug,
      quoteIdentifier,
    },
  })
}

export async function updateAddonEnabled(id: string, enabled: boolean): Promise<AddonRow | null> {
  const { rows } = await pool.query<AddonRow>(
    `UPDATE plank_addons
     SET enabled = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       package_name,
       name,
       version,
       plank_range,
       description,
       installed,
       enabled,
       compatible,
       has_admin_ui,
       settings_namespace,
       slots_json`,
    [id, enabled],
  )

  return rows[0] ?? null
}

export async function buildAdminAddonsRegistry(): Promise<AdminAddonsRegistryResponse> {
  const rows = await listAddonRows()
  const enabledRows = rows.filter((row) => row.installed && row.enabled && row.compatible)

  return {
    addons: rows.map(mapAddonRow),
    slots: {
      dashboardWidgets: enabledRows.flatMap((row) =>
        normalizeSlotsFromRow(row.slots_json).dashboardWidgets.map((slot) => ({
          addonId: row.id,
          slotId: slot.id,
          title: slot.title,
          order: slot.order ?? 100,
        })),
      ),
      addonsSections: enabledRows.flatMap((row) =>
        normalizeSlotsFromRow(row.slots_json).addonsSections.map((slot) => ({
          addonId: row.id,
          slotId: slot.id,
          title: slot.title,
          order: slot.order ?? 100,
        })),
      ),
    },
  }
}
