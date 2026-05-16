import { Link, useParams } from 'react-router-dom'
import { BoxIcon, ExternalLinkIcon, PuzzleIcon, Settings2Icon } from 'lucide-react'
import HeaderFixed from '@/components/Header'
import { useFetch } from '@/hooks/useFetch.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { type AdminAddonsRegistryResponse, canOpenAddonAdmin } from '@/lib/addons.ts'

export function AddonDetail() {
  const { addonId = '' } = useParams()
  const { data, loading } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  const addon = data?.addons.find((item) => item.id === addonId) ?? null
  const sections = (data?.slots.addonsSections ?? []).filter((slot) => slot.addonId === addonId)
  const widgets = (data?.slots.dashboardWidgets ?? []).filter((slot) => slot.addonId === addonId)

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

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Admin Surface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canOpenAddonAdmin(addon) ? (
                <div className="rounded-lg border border-dashed p-4">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <BoxIcon className="size-4" />
                    Bundle loader placeholder
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The registry is already driving this route. The actual add-on bundle mount is
                    intentionally deferred to the next implementation step.
                  </p>
                </div>
              ) : (
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
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Version</div>
                <div className="font-medium">{addon.version || 'Unknown version'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Settings Namespace</div>
                <div className="font-medium">{addon.settingsNamespace ?? 'None'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Slots</div>
                <div className="font-medium">{sections.length} sections · {widgets.length} widgets</div>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/add-ons/overview">Back to registry</Link>
                </Button>
                {addon.adminUrl && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={addon.adminUrl}>
                      Open route
                      <ExternalLinkIcon className="ml-2 size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Registered Sections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sections.length > 0 ? sections.map((slot) => (
                <div key={slot.slotId} className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">{slot.title}</div>
                  <div className="text-xs text-muted-foreground">{slot.slotId}</div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No section slots registered.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registered Widgets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {widgets.length > 0 ? widgets.map((slot) => (
                <div key={slot.slotId} className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">{slot.title}</div>
                  <div className="text-xs text-muted-foreground">{slot.slotId}</div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No dashboard widgets registered.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
