import { useEffect } from 'react'
import { BoxIcon, PackageOpenIcon } from 'lucide-react'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import {
  ADDONS_REGISTRY_UPDATED_EVENT,
  type AdminAddonsRegistryResponse,
  canOpenAddonAdmin,
} from '@/shared/lib/addons.ts'
import { SidebarNav } from './SidebarNav.tsx'

export function AddonsSidebar() {
  const { data, refetch } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')

  useEffect(() => {
    function handleRegistryUpdated() {
      refetch()
    }

    window.addEventListener(ADDONS_REGISTRY_UPDATED_EVENT, handleRegistryUpdated)
    return () => window.removeEventListener(ADDONS_REGISTRY_UPDATED_EVENT, handleRegistryUpdated)
  }, [refetch])

  const addons = (data?.addons ?? []).filter(canOpenAddonAdmin)
  const sectionTitles = new Map(
    (data?.slots.addonsSections ?? []).map((slot) => [slot.addonId, slot.title]),
  )

  const items = [
    { label: 'Overview', to: '/add-ons/overview', icon: BoxIcon },
    ...addons.map((addon) => ({
      label: sectionTitles.get(addon.id) ?? addon.name,
      to: `/add-ons/${addon.id}`,
      icon: PackageOpenIcon,
    })),
  ]

  return (
    <div className="flex flex-col">
      <div className="border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Add-ons
        </p>
      </div>
      <SidebarNav items={items} />
    </div>
  )
}
