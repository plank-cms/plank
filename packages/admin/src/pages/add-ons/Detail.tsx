import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PuzzleIcon, Settings2Icon } from 'lucide-react'
import { toast } from 'sonner'
import HeaderFixed from '@/components/Header'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import {
  type AdminAddonContentType,
  type AdminAddonModule,
  type AdminAddonRuntimeModule,
  type AdminAddonsRegistryResponse,
  canOpenAddonAdmin,
  loadAddonAdminRuntime,
} from '@/lib/addons.ts'

export function AddonDetail() {
  const { addonId = '' } = useParams()
  const { data, loading } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')
  const { data: adminModule, loading: loadingModule } = useFetch<AdminAddonModule>(
    addonId ? `/cms/admin/addons/${addonId}/admin-module` : null,
  )
  const { data: settings, loading: loadingSettings, refetch: refetchSettings } = useFetch<Record<string, string>>(
    addonId ? `/cms/admin/addons/${addonId}/settings` : null,
  )
  const { data: contentTypes, loading: loadingContentTypes } = useFetch<AdminAddonContentType[]>(
    '/cms/admin/content-types',
  )
  const { request } = useApi()
  const [runtimeModule, setRuntimeModule] = useState<AdminAddonRuntimeModule | null>(null)
  const [loadingRuntime, setLoadingRuntime] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const addon = data?.addons.find((item) => item.id === addonId) ?? null
  const sections = (data?.slots.addonsSections ?? []).filter((slot) => slot.addonId === addonId)
  const widgets = (data?.slots.dashboardWidgets ?? []).filter((slot) => slot.addonId === addonId)

  useEffect(() => {
    if (!addon || !canOpenAddonAdmin(addon)) {
      setRuntimeModule(null)
      setRuntimeError(null)
      setLoadingRuntime(false)
      return
    }

    let active = true
    setLoadingRuntime(true)
    setRuntimeError(null)

    loadAddonAdminRuntime(addon.id)
      .then((module) => {
        if (!active) return
        setRuntimeModule(module)
        if (!module) {
          setRuntimeError('This add-on did not register an admin runtime.')
        }
      })
      .catch((error) => {
        if (!active) return
        setRuntimeModule(null)
        setRuntimeError(error instanceof Error ? error.message : 'Could not load add-on admin runtime')
      })
      .finally(() => {
        if (active) setLoadingRuntime(false)
      })

    return () => {
      active = false
    }
  }, [addon])

  const saveSettings = useCallback(
    async (values: Record<string, string>): Promise<Record<string, string>> => {
      try {
        const updated = await request<Record<string, string>>(
          `/cms/admin/addons/${addonId}/settings`,
          'PUT',
          values,
        )
        refetchSettings()
        toast.success('Add-on settings saved')
        return updated
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save add-on settings')
        throw error
      }
    },
    [addonId, refetchSettings, request],
  )

  const runAction = useCallback(
    async <T = unknown>(action: string, input?: unknown): Promise<T> => {
      const response = await request<{ result: T }>(
        `/cms/admin/addons/${addonId}/actions`,
        'POST',
        { action, input },
      )

      return response.result
    },
    [addonId, request],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (!addon) {
    return (
      <section className="mt-24">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PuzzleIcon />
            </EmptyMedia>
            <EmptyTitle>Add-on not found</EmptyTitle>
            <EmptyDescription>
              This add-on is not present in the current registry.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  const hasDashboardTab = Boolean(runtimeModule?.DashboardPage)
  const hasAdminTab = Boolean(runtimeModule?.AdminPage)
  const defaultTab = hasDashboardTab ? 'dashboard' : hasAdminTab ? 'admin' : 'details'

  return (
    <>
      <HeaderFixed>
        <h1 className="text-2xl font-bold -mt-2">{addon.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{addon.packageName}</p>
      </HeaderFixed>

      <section className="mt-24 space-y-6">
        <div className="flex items-center gap-2">
          <Badge variant={addon.enabled ? 'secondary' : 'outline'}>
            {addon.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant={addon.compatible ? 'secondary' : 'destructive'}>
            {addon.compatible ? 'Compatible' : 'Incompatible'}
          </Badge>
        </div>

        <Tabs key={defaultTab} defaultValue={defaultTab}>
          <TabsList className="mb-6">
            {hasDashboardTab && <TabsTrigger value="dashboard">Dashboard</TabsTrigger>}
            {hasAdminTab && <TabsTrigger value="admin">Admin</TabsTrigger>}
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {hasDashboardTab && (
            <TabsContent value="dashboard" className="space-y-4">
              {!canOpenAddonAdmin(addon) ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Settings2Icon />
                    </EmptyMedia>
                    <EmptyTitle>Dashboard unavailable</EmptyTitle>
                    <EmptyDescription>
                      Enable the add-on and make sure it exposes an admin entry before mounting its
                      dashboard surface.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : loadingModule || loadingSettings || loadingContentTypes || loadingRuntime ? (
                <div className="flex h-40 items-center justify-center rounded-lg border bg-background">
                  <Spinner className="size-6" />
                </div>
              ) : adminModule && settings && runtimeModule?.DashboardPage ? (
                <runtimeModule.DashboardPage
                  addon={addon}
                  definition={adminModule}
                  settings={settings}
                  contentTypes={contentTypes ?? []}
                  runAction={runAction}
                  saveSettings={saveSettings}
                />
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Settings2Icon />
                    </EmptyMedia>
                    <EmptyTitle>Dashboard runtime unavailable</EmptyTitle>
                    <EmptyDescription>
                      {runtimeError ?? 'This add-on does not expose a mountable dashboard runtime yet.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          )}

          {hasAdminTab && (
            <TabsContent value="admin" className="space-y-4">
              {!canOpenAddonAdmin(addon) ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Settings2Icon />
                    </EmptyMedia>
                    <EmptyTitle>Admin view unavailable</EmptyTitle>
                    <EmptyDescription>
                      Enable the add-on and make sure it exposes an admin entry before mounting its
                      admin surface.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : loadingModule || loadingSettings || loadingContentTypes || loadingRuntime ? (
                <div className="flex h-40 items-center justify-center rounded-lg border bg-background">
                  <Spinner className="size-6" />
                </div>
              ) : adminModule && settings && runtimeModule?.AdminPage ? (
                <runtimeModule.AdminPage
                  addon={addon}
                  definition={adminModule}
                  settings={settings}
                  contentTypes={contentTypes ?? []}
                  runAction={runAction}
                  saveSettings={saveSettings}
                />
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Settings2Icon />
                    </EmptyMedia>
                    <EmptyTitle>Admin runtime unavailable</EmptyTitle>
                    <EmptyDescription>
                      {runtimeError ?? 'This add-on does not expose a mountable admin runtime yet.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          )}

          <TabsContent value="details">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="bg-background">
                <CardHeader>
                  <CardTitle>{adminModule?.title ?? 'Metadata'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {adminModule?.description && (
                    <p className="text-muted-foreground">{adminModule.description}</p>
                  )}
                  <div>
                    <div className="text-muted-foreground">Version</div>
                    <div className="font-medium">{addon.version || 'Unknown version'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Settings Namespace</div>
                    <div className="font-medium">{addon.settingsNamespace ?? 'None'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">State</div>
                    <div className="font-medium">
                      {addon.installed ? 'Installed' : 'Missing'} · {addon.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-background">
                <CardHeader>
                  <CardTitle>Slot Registration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sections.length > 0 ? sections.map((slot) => (
                    <div key={slot.slotId} className="rounded-md border bg-background px-3 py-2 text-sm">
                      <div className="font-medium">Section</div>
                      <div className="text-xs text-muted-foreground">{slot.slotId}</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No section slots registered.</p>}
                  {widgets.length > 0 ? widgets.map((slot) => (
                    <div key={slot.slotId} className="rounded-md border bg-background px-3 py-2 text-sm">
                      <div className="font-medium">Widget</div>
                      <div className="text-xs text-muted-foreground">{slot.slotId}</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No widget slots registered.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </>
  )
}
