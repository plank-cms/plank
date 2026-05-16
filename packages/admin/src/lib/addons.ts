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

export function canOpenAddonAdmin(addon: AdminAddonRegistryItem): boolean {
  return addon.installed && addon.enabled && addon.compatible && addon.hasAdminUi
}
