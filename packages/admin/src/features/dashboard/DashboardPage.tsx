import { useEffect, useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import HeaderFixed from '@/shared/components/Header'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useAuth } from '@/shared/context/auth.tsx'
import { Button } from '@/shared/ui/button.tsx'
import { useSettings } from '@/shared/context/settings.tsx'
import { TooltipProvider } from '@/shared/ui/tooltip.tsx'
import { DashboardEntryFieldsDialog } from './components/DashboardEntryFieldsDialog.tsx'
import { DashboardStats } from './components/DashboardStats.tsx'
import { EntriesTable } from './components/EntriesTable.tsx'
import { RECENT_ENTRY_FIELD_PREFS_KEY, guessDefaultField, toEntryLabel } from './lib/dashboard.ts'
import type {
  ContentType,
  DashboardStats as DashboardStatsType,
  EntriesResponse,
  Entry,
  EntryFieldMap,
  RecentEntry,
} from './types.ts'

export function Dashboard() {
  const navigate = useNavigate()
  const { timezone } = useSettings()
  const { user } = useAuth()
  const { data: contentTypes } = useFetch<ContentType[]>('/cms/admin/content-types')
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [myDrafts, setMyDrafts] = useState<RecentEntry[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [loadingMyDrafts, setLoadingMyDrafts] = useState(false)
  const [configureOpen, setConfigureOpen] = useState(false)
  const [entryFieldMap, setEntryFieldMap] = useState<EntryFieldMap>({})

  const [stats, setStats] = useState<DashboardStatsType | null>(null)

  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canReadEntries = permissions.includes('*') || permissions.includes('entries:read')

  const collectionTypes = useMemo(
    () => (contentTypes ?? []).filter((ct) => ct.kind === 'collection'),
    [contentTypes],
  )
  const collectionCount = collectionTypes.length
  const singleCount = useMemo(
    () => (contentTypes ?? []).filter((ct) => ct.kind === 'single').length,
    [contentTypes],
  )

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

  useEffect(() => {
    if (!canReadEntries || collectionTypes.length === 0 || !user?.id) {
      setMyDrafts([])
      return
    }

    const controller = new AbortController()

    setLoadingMyDrafts(true)
    Promise.all(
      collectionTypes.map(async (ct) => {
        const res = await fetch(
          `/cms/admin/content-types/${ct.slug}/entries?page=1&limit=50&status=draft&sort=updated_at&order=desc`,
          { credentials: 'include', signal: controller.signal },
        )
        if (!res.ok) return [] as RecentEntry[]
        const json = (await res.json()) as EntriesResponse
        const draftEntries: RecentEntry[] = []
        for (const entry of json.data ?? []) {
          if (entry.status !== 'draft' || entry.created_by !== user.id) continue
          draftEntries.push({
            ...entry,
            slug: ct.slug,
            contentTypeName: ct.name,
          })
        }
        return draftEntries
      }),
    )
      .then((all) => {
        const merged = all
          .flat()
          .sort(
            (a, b) =>
              new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
          )
          .slice(0, 7)
        setMyDrafts(merged)
      })
      .catch(() => {
        setMyDrafts([])
      })
      .finally(() => setLoadingMyDrafts(false))

    return () => controller.abort()
  }, [canReadEntries, collectionTypes, user?.id])

  return (
    <div>
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold -mt-2">Plank Forge</h1>
          <div className="flex items-center gap-2">
            <DashboardEntryFieldsDialog
              open={configureOpen}
              onOpenChange={setConfigureOpen}
              collectionTypes={collectionTypes}
              entryFieldMap={entryFieldMap}
              guessDefaultField={guessDefaultField}
              setEntryFieldMap={(updater) => setEntryFieldMap(updater)}
            />

            {canWriteEntries && (
              <Button onClick={handleNewEntry} disabled={!contentTypes || contentTypes.length === 0}>
                <PlusIcon className="size-4" />
                New entry
              </Button>
            )}
          </div>
        </div>
      </HeaderFixed>

      <DashboardStats
        contentTypes={contentTypes ?? []}
        collectionCount={collectionCount}
        singleCount={singleCount}
        stats={stats}
      />

      <section className="mt-4">
        <TooltipProvider>
          <div className="space-y-4">
            <EntriesTable
              title="My drafts"
              dateLabel="Updated"
              emptyMessage="You have no drafts."
              entries={myDrafts}
              loading={loadingMyDrafts}
              timezone={timezone}
              navigate={navigate}
              collectionTypes={collectionTypes}
              entryFieldMap={entryFieldMap}
              guessDefaultField={guessDefaultField}
              toEntryLabel={toEntryLabel}
              getDateValue={(entry) => entry.updated_at}
            />

            <EntriesTable
              title="Recent content"
              dateLabel="Published"
              emptyMessage="No recent entries found."
              entries={recent}
              loading={loadingRecent}
              timezone={timezone}
              navigate={navigate}
              collectionTypes={collectionTypes}
              entryFieldMap={entryFieldMap}
              guessDefaultField={guessDefaultField}
              toEntryLabel={toEntryLabel}
              getDateValue={(entry) => entry.published_at}
            />
          </div>
        </TooltipProvider>
      </section>
    </div>
  )
}
