import { useMemo, useState } from 'react'
import { BoxIcon, PackageCheckIcon, PuzzleIcon, Settings2Icon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import HeaderFixed from '@/shared/components/Header'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useApi } from '@/shared/hooks/useApi.ts'
import { Badge } from '@/shared/ui/badge.tsx'
import { Button } from '@/shared/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/ui/empty.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import { Switch } from '@/shared/ui/switch.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table.tsx'
import {
  notifyAddonsRegistryUpdated,
  type AdminAddonsRegistryResponse,
  canOpenAddonAdmin,
} from '@/shared/lib/addons.ts'

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
  const { data, loading, error, refetch } = useFetch<AdminAddonsRegistryResponse>(
    '/cms/admin/addons/registry',
  )
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
      notifyAddonsRegistryUpdated()
      toast.success(enabled ? 'Add-on disabled' : 'Add-on enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update add-on')
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(addonId: string) {
    setPendingId(addonId)

    try {
      await request(`/cms/admin/addons/${addonId}`, 'DELETE')
      refetch()
      notifyAddonsRegistryUpdated()
      toast.success('Add-on registry entry removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove add-on registry entry')
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

      <section className="mt-24 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-background">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-bold uppercase">Detected</CardTitle>
                <PuzzleIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Official add-ons detected by the host</p>
            </CardContent>
          </Card>
          <Card className="bg-background">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-bold uppercase">Enabled</CardTitle>
                <PackageCheckIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold">{stats.enabled}</div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Add-ons currently active in this instance</p>
            </CardContent>
          </Card>
          <Card className="bg-background">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-bold uppercase">Compatible</CardTitle>
                <BoxIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold">{stats.compatible}</div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Packages matching the current Plank version</p>
            </CardContent>
          </Card>
          <Card className="bg-background">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-bold uppercase">Admin UI</CardTitle>
                <Settings2Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold">{stats.visibleAdmin}</div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Add-ons exposing admin surfaces</p>
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
                Install an official `@plank-cms/addon-*` package in the host project and restart the
                server to populate this registry.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <Table className="w-full text-sm">
              <TableHeader className="border-b border-border font-bold uppercase">
                <TableRow className="hover:bg-transparent">
                  <TableHead colSpan={5} className="h-auto px-4 py-3">
                    <h2 className="text-base font-semibold text-foreground">Registry</h2>
                  </TableHead>
                </TableRow>
                <TableRow className="border-t border-border hover:bg-transparent">
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Add-on
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Package
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Settings
                  </TableHead>
                  <TableHead className="w-28 px-4 py-3 text-right font-medium text-muted-foreground">
                    Enabled
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map((addon) => {
                  const disabled = saving && pendingId === addon.id
                  const canToggle = addon.installed && addon.compatible
                  const canDelete = !addon.installed || !addon.compatible

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
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-3">
                          {disabled && <Spinner className="size-4" />}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2 text-destructive hover:text-destructive"
                              disabled={disabled}
                              onClick={() => handleDelete(addon.id)}
                            >
                              <Trash2Icon className="size-3.5" />
                              Remove
                            </Button>
                          ) : (
                            <Switch
                              checked={addon.enabled}
                              disabled={!canToggle || disabled}
                              onCheckedChange={() => handleToggle(addon.id, addon.enabled)}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Could not load add-ons registry: {error}</p>
        )}
      </section>
    </>
  )
}
