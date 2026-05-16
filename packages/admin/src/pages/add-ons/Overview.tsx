import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BoxIcon, PackageCheckIcon, PuzzleIcon, Settings2Icon } from 'lucide-react'
import { toast } from 'sonner'
import HeaderFixed from '@/components/Header'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import { type AdminAddonsRegistryResponse, canOpenAddonAdmin } from '@/lib/addons.ts'

function StatusBadge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}) {
  return <Badge variant={variant}>{children}</Badge>
}

export function AddonsOverview() {
  const { data, loading, error, refetch } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')
  const { request, loading: saving } = useApi()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const addons = data?.addons ?? []
  const stats = useMemo(
    () => ({
      total: addons.length,
      enabled: addons.filter((addon) => addon.enabled).length,
      compatible: addons.filter((addon) => addon.compatible).length,
      visibleAdmin: addons.filter(canOpenAddonAdmin).length,
    }),
    [addons],
  )

  async function handleToggle(addonId: string, enabled: boolean) {
    setPendingId(addonId)

    try {
      await request(`/cms/admin/addons/${addonId}/${enabled ? 'disable' : 'enable'}`, 'POST')
      refetch()
      toast.success(enabled ? 'Add-on disabled' : 'Add-on enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update add-on')
    } finally {
      setPendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
      )
  }

  return (
    <>
      <HeaderFixed>
        <h1 className="text-2xl font-bold -mt-2">Add-ons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registry, activation state and admin surface for official extensions.
        </p>
      </HeaderFixed>

      <div className="mt-24 flex min-w-0 flex-1 flex-col gap-6 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Detected</CardTitle>
              <PuzzleIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Enabled</CardTitle>
              <PackageCheckIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.enabled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Compatible</CardTitle>
              <BoxIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.compatible}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Admin UI</CardTitle>
              <Settings2Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.visibleAdmin}</div>
            </CardContent>
          </Card>
        </div>

        {addons.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PuzzleIcon />
              </EmptyMedia>
              <EmptyTitle>No add-ons detected</EmptyTitle>
              <EmptyDescription>
                Install an official `@plank-cms/addon-*` package in the host project and restart
                the server to populate this registry.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Registry</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Add-on</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Settings</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead className="w-28 text-right">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {addons.map((addon) => {
                    const disabled = saving && pendingId === addon.id
                    const canToggle = addon.installed && addon.compatible

                    return (
                      <TableRow key={addon.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{addon.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {addon.version || 'Unknown version'}
                            </div>
                            {addon.description && (
                              <p className="max-w-md text-xs text-muted-foreground">
                                {addon.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{addon.packageName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge variant={addon.installed ? 'secondary' : 'outline'}>
                              {addon.installed ? 'Installed' : 'Missing'}
                            </StatusBadge>
                            <StatusBadge variant={addon.compatible ? 'secondary' : 'destructive'}>
                              {addon.compatible ? 'Compatible' : 'Incompatible'}
                            </StatusBadge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {addon.settingsNamespace ? (
                            <Badge variant="outline">{addon.settingsNamespace}</Badge>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canOpenAddonAdmin(addon) ? (
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/add-ons/${addon.id}`}>Open</Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">
                              {addon.hasAdminUi ? 'Enable first' : 'No UI'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-3">
                            {disabled && <Spinner className="size-4" />}
                            <Switch
                              checked={addon.enabled}
                              disabled={!canToggle || disabled}
                              onCheckedChange={() => handleToggle(addon.id, addon.enabled)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Slots</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="mb-2 text-sm font-medium">Dashboard Widgets</div>
              {data && data.slots.dashboardWidgets.length > 0 ? (
                <div className="space-y-2">
                  {data.slots.dashboardWidgets.map((slot) => (
                    <div key={slot.slotId} className="rounded-md border border-dashed px-3 py-2 text-sm">
                      <div className="font-medium">{slot.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {slot.addonId} · {slot.slotId} · order {slot.order}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyContent>
                  <EmptyDescription>No dashboard widgets registered yet.</EmptyDescription>
                </EmptyContent>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-2 text-sm font-medium">Add-on Sections</div>
              {data && data.slots.addonsSections.length > 0 ? (
                <div className="space-y-2">
                  {data.slots.addonsSections.map((slot) => (
                    <div key={slot.slotId} className="rounded-md border border-dashed px-3 py-2 text-sm">
                      <div className="font-medium">{slot.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {slot.addonId} · {slot.slotId} · order {slot.order}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyContent>
                  <EmptyDescription>No admin sections registered yet.</EmptyDescription>
                </EmptyContent>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive">
            Could not load add-ons registry: {error}
          </p>
        )}
      </div>
    </>
  )
}
