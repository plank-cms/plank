import type { ComponentType } from 'react'

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

export type AdminAddonField =
  | {
      key: string
      type: 'contentTypesMultiSelect'
      label: string
      description: string
      defaultValue: string[]
    }
  | {
      key: string
      type: 'number'
      label: string
      description: string
      min: number
      defaultValue: number
    }

export type AdminAddonModule = {
  addonId: string
  title: string
  description: string
  settingsNamespace: string
  checks: Array<{
    id: string
    label: string
    description: string
  }>
  settings: {
    title: string
    description: string
    fields: AdminAddonField[]
  }
}

export type AdminAddonContentType = {
  fields?: Array<{
    name: string
    type:
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
    relatedSlug?: string
    relationType?: 'many-to-one' | 'one-to-one' | 'one-to-many' | 'many-to-many'
  }>
  slug: string
  name: string
  kind: 'collection' | 'single'
}

export type AdminAddonRuntimeProps = {
  addon: AdminAddonRegistryItem
  definition: AdminAddonModule
  settings: Record<string, string>
  contentTypes: AdminAddonContentType[]
  runAction: <T = unknown>(action: string, input?: unknown) => Promise<T>
  saveSettings: (values: Record<string, string>) => Promise<Record<string, string>>
}

export type AdminAddonRuntimeModule = {
  addonId: string
  DashboardPage?: ComponentType<AdminAddonRuntimeProps>
  AdminPage?: ComponentType<AdminAddonRuntimeProps>
}

export const ADDONS_REGISTRY_UPDATED_EVENT = 'plank:addons-registry-updated'

const addonRuntimeCache = new Map<string, Promise<AdminAddonRuntimeModule | null>>()

export function canOpenAddonAdmin(addon: AdminAddonRegistryItem): boolean {
  return addon.installed && addon.enabled && addon.compatible && addon.hasAdminUi
}

export function notifyAddonsRegistryUpdated(): void {
  window.dispatchEvent(new CustomEvent(ADDONS_REGISTRY_UPDATED_EVENT))
}

export async function loadAddonAdminRuntime(addonId: string): Promise<AdminAddonRuntimeModule | null> {
  const existing = window.PlankAddonAdminModules?.[addonId]
  if (existing) return existing

  const cached = addonRuntimeCache.get(addonId)
  if (cached) return cached

  const promise = new Promise<AdminAddonRuntimeModule | null>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `/cms/admin/addons/${addonId}/admin-entry.js`
    script.async = true
    script.dataset.plankAddonId = addonId

    script.onload = () => {
      resolve(window.PlankAddonAdminModules?.[addonId] ?? null)
    }

    script.onerror = () => {
      script.remove()
      addonRuntimeCache.delete(addonId)
      reject(new Error(`Could not load admin runtime for ${addonId}`))
    }

    document.head.appendChild(script)
  })

  addonRuntimeCache.set(addonId, promise)
  return promise
}
