import { useEffect, useMemo, useState } from 'react'
import { Columns3CogIcon, PlusIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import HeaderFixed from '@/components/Header'
import { useFetch } from '@/hooks/useFetch.ts'
import { useAuth } from '@/context/auth.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { formatDate } from '@/lib/formatDate.ts'
import { useSettings } from '@/context/settings.tsx'
import { UserAvatar } from '@/components/ui/custom/UserAvatar.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import { type AdminAddonsRegistryResponse } from '@/lib/addons.ts'

type FieldDef = { name: string; type: string }
type ContentType = {
  slug: string
  name: string
  kind: 'collection' | 'single'
  isDefault: boolean
  fields: FieldDef[]
}
type Entry = Record<string, unknown> & {
  id: string
  status: 'draft' | 'scheduled' | 'published'
  published_at: string | null
  created_by: string | null
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}
type EntriesResponse = { data: Entry[]; total: number }
type RecentEntry = Entry & { slug: string; contentTypeName: string }
type EntryFieldMap = Record<string, string>

type DashboardStats = {
  totalEntries: number
  totalDrafts: number
  myDrafts: number
  totalScheduled: number
  myScheduled: number
}

const RECENT_ENTRY_FIELD_PREFS_KEY = 'plank_dashboard_recent_entry_fields'

function AuthorCell({ entry }: { entry: RecentEntry }) {
  const first = entry._author_first_name
  const last = entry._author_last_name
  const label = first || last ? [first, last].filter(Boolean).join(' ') : null

  const avatar = (
    <UserAvatar
      avatarUrl={entry._author_avatar_url}
      firstName={entry._author_first_name}
      lastName={entry._author_last_name}
      className="size-7"
      fallbackClassName="text-[10px]"
    />
  )

  if (!label) return avatar

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { timezone } = useSettings()
  const { user } = useAuth()
  const { data: contentTypes } = useFetch<ContentType[]>('/cms/admin/content-types')
  const { data: addonsRegistry } = useFetch<AdminAddonsRegistryResponse>('/cms/admin/addons/registry')
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [configureOpen, setConfigureOpen] = useState(false)
  const [entryFieldMap, setEntryFieldMap] = useState<EntryFieldMap>({})

  const [stats, setStats] = useState<DashboardStats | null>(null)

  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canReadEntries = permissions.includes('*') || permissions.includes('entries:read')

  const collectionTypes = useMemo(
    () => (contentTypes ?? []).filter((ct) => ct.kind === 'collection'),
    [contentTypes],
  )
  const dashboardWidgets = addonsRegistry?.slots.dashboardWidgets ?? []
  const collectionCount = collectionTypes.length
  const singleCount = useMemo(
    () => (contentTypes ?? []).filter((ct) => ct.kind === 'single').length,
    [contentTypes],
  )

  function guessDefaultField(ct: ContentType): string {
    const preferred = ['title', 'name', 'entry']
    for (const p of preferred) {
      if (ct.fields.some((f) => f.name === p)) return p
    }
    const byType = ct.fields.find((f) => ['string', 'text', 'uid'].includes(f.type))
    return byType?.name ?? 'id'
  }

  function toEntryLabel(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'Untitled'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return JSON.stringify(value)
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_ENTRY_FIELD_PREFS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as EntryFieldMap
      setEntryFieldMap(parsed)
    } catch {
      /* ignore bad localStorage values */
    }
  }, [])

  useEffect(() => {
    if (collectionTypes.length === 0) return
    setEntryFieldMap((prev) => {
      const next: EntryFieldMap = { ...prev }
      let changed = false
      for (const ct of collectionTypes) {
        if (!next[ct.slug]) {
          next[ct.slug] = guessDefaultField(ct)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [collectionTypes])

  useEffect(() => {
    window.localStorage.setItem(RECENT_ENTRY_FIELD_PREFS_KEY, JSON.stringify(entryFieldMap))
  }, [entryFieldMap])

  useEffect(() => {
    if (!canReadEntries || collectionTypes.length === 0) return

    const controller = new AbortController()

    async function fetchCount(slug: string, status?: string): Promise<{ total: number; data: Entry[] }> {
      const params = new URLSearchParams({ page: '1', limit: '100' })
      if (status) params.set('status', status)
      const res = await fetch(`/cms/admin/content-types/${slug}/entries?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      })
      if (!res.ok) return { total: 0, data: [] }
      const json = (await res.json()) as EntriesResponse
      return { total: json.total ?? 0, data: json.data ?? [] }
    }

    Promise.all(
      collectionTypes.map(async (ct) => {
        const [allRes, draftsRes, scheduledRes] = await Promise.all([
          fetchCount(ct.slug),
          fetchCount(ct.slug, 'draft'),
          fetchCount(ct.slug, 'scheduled'),
        ])
        return { allRes, draftsRes, scheduledRes }
      }),
    )
      .then((results) => {
        const userId = user?.id
        let totalEntries = 0
        let totalDrafts = 0
        let myDrafts = 0
        let totalScheduled = 0
        let myScheduled = 0

        for (const { allRes, draftsRes, scheduledRes } of results) {
          totalEntries += allRes.total
          totalDrafts += draftsRes.total
          totalScheduled += scheduledRes.total
          if (userId) {
            myDrafts += draftsRes.data.filter((e) => e.created_by === userId).length
            myScheduled += scheduledRes.data.filter((e) => e.created_by === userId).length
          }
        }

        setStats({ totalEntries, totalDrafts, myDrafts, totalScheduled, myScheduled })
      })
      .catch(() => {})

    return () => controller.abort()
  }, [canReadEntries, collectionTypes, user?.id])

  function handleNewEntry() {
    if (!contentTypes || contentTypes.length === 0) return
    const target = contentTypes.find((ct) => ct.isDefault) ?? contentTypes[0]
    navigate(`/content/${target.slug}/new`)
  }

  useEffect(() => {
    if (!canReadEntries || collectionTypes.length === 0) {
      setRecent([])
      return
    }

    const controller = new AbortController()

    setLoadingRecent(true)
    Promise.all(
      collectionTypes.map(async (ct) => {
        const res = await fetch(
          `/cms/admin/content-types/${ct.slug}/entries?page=1&limit=50&sort=published_at&order=desc`,
          { credentials: 'include', signal: controller.signal },
        )
        if (!res.ok) return [] as RecentEntry[]
        const json = (await res.json()) as EntriesResponse
        const recentEntries: RecentEntry[] = []
        for (const entry of json.data ?? []) {
          if (entry.status !== 'published' || !entry.published_at) continue
          recentEntries.push({
            ...entry,
            slug: ct.slug,
            contentTypeName: ct.name,
          })
        }
        return recentEntries
      }),
    )
      .then((all) => {
        const merged = all
          .flat()
          .sort(
            (a, b) =>
              new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime(),
          )
          .slice(0, 7)
        setRecent(merged)
      })
      .catch(() => {
        setRecent([])
      })
      .finally(() => setLoadingRecent(false))

    return () => controller.abort()
  }, [canReadEntries, collectionTypes])

  return (
    <div>
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold -mt-2">Plank Forge</h1>
          {canWriteEntries && (
            <Button onClick={handleNewEntry} disabled={!contentTypes || contentTypes.length === 0}>
              <PlusIcon className="size-4" />
              New entry
            </Button>
          )}
        </div>
      </HeaderFixed>

      <section className="mt-24 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: 'Entries',
            value: stats?.totalEntries ?? '—',
            context: contentTypes ? `${collectionCount} Content Types` : '—',
          },
          {
            label: 'Content Types',
            value: contentTypes?.length ?? '—',
            context: contentTypes ? `${collectionCount} Collection · ${singleCount} Single` : '—',
          },
          {
            label: 'Drafts',
            value: stats?.totalDrafts ?? '—',
            context: stats ? `${stats.myDrafts} owned by you` : '—',
          },
          {
            label: 'Scheduled',
            value: stats?.totalScheduled ?? '—',
            context: stats ? `${stats.myScheduled} owned by you` : '—',
          },
        ].map(({ label, value, context }) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-base font-bold uppercase">{label}</CardTitle>
              <div className="text-3xl font-bold">{value}</div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{context}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold uppercase">Extension Slots</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardWidgets.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dashboardWidgets.map((slot) => (
                  <div key={slot.slotId} className="rounded-lg border border-dashed p-4">
                    <div className="font-medium">{slot.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {slot.addonId} · {slot.slotId} · order {slot.order}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No add-on dashboard widgets are registered yet.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4">
        <TooltipProvider>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <Table className="w-full text-sm">
              <TableHeader className="border-b border-border font-bold uppercase">
                <TableRow className="hover:bg-transparent">
                  <TableHead colSpan={4} className="px-4 py-3 h-auto">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-foreground">Recent content</h2>
                      <Dialog open={configureOpen} onOpenChange={setConfigureOpen}>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setConfigureOpen(true)}
                        >
                          <Columns3CogIcon className="size-4" />
                        </Button>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Recent content fields</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            {collectionTypes.map((ct) => (
                              <div key={ct.slug} className="space-y-1.5">
                                <Label htmlFor={`recent-field-${ct.slug}`}>{ct.name}</Label>
                                <Select
                                  value={entryFieldMap[ct.slug] ?? guessDefaultField(ct)}
                                  onValueChange={(value) =>
                                    setEntryFieldMap((prev) => ({ ...prev, [ct.slug]: value }))
                                  }
                                >
                                  <SelectTrigger id={`recent-field-${ct.slug}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="id">id</SelectItem>
                                    {ct.fields.map((field) => (
                                      <SelectItem key={field.name} value={field.name}>
                                        {field.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow className="border-t border-border hover:bg-transparent">
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Entry
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Collection Type
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Author
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Published
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRecent ? (
                  <TableRow className="border-b">
                    <TableCell colSpan={4} className="h-24">
                      <Spinner className="mx-auto size-5" />
                    </TableCell>
                  </TableRow>
                ) : recent.length === 0 ? (
                  <TableRow className="border-b">
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No recent entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recent.map((entry) => (
                    <TableRow
                      key={`${entry.slug}-${entry.id}`}
                      className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => navigate(`/content/${entry.slug}/${entry.id}`)}
                          className="text-left hover:underline"
                        >
                          <div className="font-medium">
                            {toEntryLabel(
                              entry[
                                entryFieldMap[entry.slug] ??
                                  guessDefaultField(
                                    collectionTypes.find((ct) => ct.slug === entry.slug) ?? {
                                      slug: entry.slug,
                                      name: entry.contentTypeName,
                                      kind: 'collection',
                                      isDefault: false,
                                      fields: [],
                                    },
                                  )
                              ],
                            )}
                          </div>
                        </button>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle">
                        <Badge variant="outline">{entry.contentTypeName}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle">
                        <AuthorCell entry={entry} />
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle">
                        {entry.published_at ? formatDate(entry.published_at, timezone) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      </section>
    </div>
  )
}
