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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

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
  _author_first_name: string | null
  _author_last_name: string | null
  _author_avatar_url: string | null
}
type EntriesResponse = { data: Entry[] }
type RecentEntry = Entry & { slug: string; contentTypeName: string }
type EntryFieldMap = Record<string, string>

const RECENT_ENTRY_FIELD_PREFS_KEY = 'plank_dashboard_recent_entry_fields'

export function Dashboard() {
  const navigate = useNavigate()
  const { timezone } = useSettings()
  const { user } = useAuth()
  const { data: contentTypes } = useFetch<ContentType[]>('/cms/admin/content-types')
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [configureOpen, setConfigureOpen] = useState(false)
  const [entryFieldMap, setEntryFieldMap] = useState<EntryFieldMap>({})

  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canReadEntries = permissions.includes('*') || permissions.includes('entries:read')

  const collectionTypes = useMemo(
    () => (contentTypes ?? []).filter((ct) => ct.kind === 'collection'),
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
      const raw = localStorage.getItem(RECENT_ENTRY_FIELD_PREFS_KEY)
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
    localStorage.setItem(RECENT_ENTRY_FIELD_PREFS_KEY, JSON.stringify(entryFieldMap))
  }, [entryFieldMap])

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
    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    setLoadingRecent(true)
    Promise.all(
      collectionTypes.map(async (ct) => {
        const res = await fetch(
          `/cms/admin/content-types/${ct.slug}/entries?page=1&limit=50&sort=published_at&order=desc`,
          { headers, signal: controller.signal },
        )
        if (!res.ok) return [] as RecentEntry[]
        const json = (await res.json()) as EntriesResponse
        return (json.data ?? [])
          .filter((entry) => entry.status === 'published' && Boolean(entry.published_at))
          .map((entry) => ({
            ...entry,
            slug: ct.slug,
            contentTypeName: ct.name,
          }))
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

  return (
    <div>
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold -mt-2">Dashboard</h1>
          {canWriteEntries && (
            <Button onClick={handleNewEntry} disabled={!contentTypes || contentTypes.length === 0}>
              <PlusIcon className="size-4" />
              New entry
            </Button>
          )}
        </div>
      </HeaderFixed>

      <section className="mt-24">
        <TooltipProvider>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b border-border ">
                <tr>
                  <th colSpan={4} className="px-4 py-3">
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
                  </th>
                </tr>
                <tr className="border-t border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entry</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Collection Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Author</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Published
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingRecent ? (
                  <tr className="border-b">
                    <td colSpan={4} className="h-24">
                      <Spinner className="mx-auto size-5" />
                    </td>
                  </tr>
                ) : recent.length === 0 ? (
                  <tr className="border-b">
                    <td colSpan={4} className="h-24 text-center text-muted-foreground">
                      No recent entries found.
                    </td>
                  </tr>
                ) : (
                  recent.map((entry) => (
                    <tr
                      key={`${entry.slug}-${entry.id}`}
                      className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 align-middle">
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
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Badge variant="outline">{entry.contentTypeName}</Badge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <AuthorCell entry={entry} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {entry.published_at ? formatDate(entry.published_at, timezone) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      </section>
    </div>
  )
}
