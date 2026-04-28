import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { format } from 'date-fns'
import { Trash2Icon, CalendarClockIcon, ChevronDownIcon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut.ts'
import { useSettings } from '@/context/settings.tsx'
import { useAuth } from '@/context/auth.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Calendar } from '@/components/ui/calendar.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import { FieldInput } from '@/components/content/FieldInput.tsx'
import type { FieldDef } from '@/components/content/FieldInput.tsx'
import { FIELD_WIDTH_SPAN } from '@/components/content-types/FieldCard.tsx'
import type { FieldWidth } from '@/components/content-types/FieldCard.tsx'
import { formatDatetime, getTimeInTimezone, combineDateAndTime } from '@/lib/formatDate.ts'
import HeaderFixed from '@/components/Header'

type ContentType = {
  name: string
  slug: string
  kind: 'collection' | 'single'
  fields: FieldDef[]
}

type Entry = Record<string, unknown> & {
  status?: 'draft' | 'scheduled' | 'published'
  published_data?: Record<string, unknown> | null
  scheduled_for?: string | null
}

export function EntryForm() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const navigate = useNavigate()
  const isNew = !id
  const { timezone, locales: settingsLocales, defaultLocale } = useSettings()
  const { user } = useAuth()

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null,
  )
  const { data: existing, loading: loadingEntry } = useFetch<Entry>(
    slug && id ? `/cms/admin/entries/${slug}/${id}` : null,
  )

  const { loading: saving, request } = useApi<Entry>()
  const { loading: patching, request: requestStatus } = useApi<Entry>()
  const { loading: deleting, request: requestDelete } = useApi()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [locales, setLocales] = useState<string[]>([])
  const [activeLocale, setActiveLocale] = useState<string>('')
  const [localizationEnabled, setLocalizationEnabled] = useState<boolean>(false)
  // newLocale removed: locales now managed in Settings > Overview > General
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published'>('draft')
  const [scheduledFor, setScheduledFor] = useState<string>('')
  const [isPublishedStale, setIsPublishedStale] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Scheduler panel state
  const [showScheduler, setShowScheduler] = useState(false)
  const [calOpen, setCalOpen] = useState(false)
  const [schedDate, setSchedDate] = useState<Date | undefined>()
  const [schedTime, setSchedTime] = useState('09:00')

  const original = useRef<string>('{}')
  const skipBlocker = useRef(false)

  useEffect(() => {
    if (isNew) {
      const empty: Record<string, unknown> = {}
      ct?.fields.forEach((f) => {
        empty[f.name] = f.type === 'boolean' ? false : ''
      })
      // prepare localized container and default locales
      empty.localized = {}
      const defaults = settingsLocales && settingsLocales.length > 0 ? settingsLocales : ['en']
      setLocales(defaults)
      setActiveLocale(defaultLocale ?? defaults[0])
      setLocalizationEnabled(false)
      setValues(empty)
      setStatus('draft')
      setScheduledFor('')
      setIsPublishedStale(false)
      original.current = JSON.stringify(empty)
      return
    }
    if (!existing || !ct) return

    const initial: Record<string, unknown> = {}
    ct.fields.forEach((f) => {
      initial[f.name] = existing[f.name] ?? (f.type === 'boolean' ? false : '')
    })
    // localized values
    // normalize to a plain object so TS doesn't treat it as `unknown`
    const rawLocalized = (existing as any).localized
    const localizedObj: Record<string, any> =
      rawLocalized && typeof rawLocalized === 'object' ? rawLocalized : {}
    initial.localized = localizedObj
    const detectedLocales = Object.keys(localizedObj).filter((k) => !k.startsWith('_'))
    const meta = localizedObj._meta || {}
    const enabled = meta.enabled ?? detectedLocales.length > 0
    const primary = meta.primary ?? detectedLocales[0] ?? defaultLocale ?? 'en'
    if (detectedLocales.length > 0) {
      setLocales(detectedLocales)
      setActiveLocale(detectedLocales[0])
    } else {
      const defaults = settingsLocales && settingsLocales.length > 0 ? settingsLocales : ['en']
      setLocales(defaults)
      setActiveLocale(defaultLocale ?? defaults[0])
    }
    setLocalizationEnabled(Boolean(enabled))
    setValues(initial)
    setStatus(existing.status ?? 'draft')
    original.current = JSON.stringify(initial)

    if (existing.scheduled_for) {
      setScheduledFor(existing.scheduled_for)
      setSchedDate(new Date(existing.scheduled_for))
      setSchedTime(getTimeInTimezone(existing.scheduled_for, timezone))
    } else {
      setScheduledFor('')
    }

    if (existing.status === 'published' && existing.published_data) {
      const normalize = (v: unknown, type: string) => {
        if (type === 'datetime' && v && typeof v === 'string') {
          // TIMESTAMP columns (no timezone) serialize to JSONB without a TZ indicator;
          // append 'Z' so new Date() parses as UTC instead of local time.
          const s = /Z|[+-]\d{2}:\d{2}$/.test(v) ? v : v + 'Z'
          const d = new Date(s)
          return isNaN(d.getTime()) ? v : d.toISOString()
        }
        return v
      }
      const snap: Record<string, unknown> = {}
      const normalizedInitial: Record<string, unknown> = {}
      ct.fields.forEach((f) => {
        // Skip fields absent from published_data (e.g. M:M relations stored in junction tables)
        if (!(f.name in existing.published_data!)) return
        snap[f.name] = normalize(
          existing.published_data![f.name] ?? (f.type === 'boolean' ? false : ''),
          f.type,
        )
        normalizedInitial[f.name] = normalize(initial[f.name], f.type)
      })
      setIsPublishedStale(JSON.stringify(normalizedInitial) !== JSON.stringify(snap))
    } else {
      setIsPublishedStale(false)
    }
  }, [existing, ct, isNew])

  const isDirty = JSON.stringify(values) !== original.current

  const blocker = useBlocker(
    useCallback(() => {
      if (skipBlocker.current) return false
      return isDirty
    }, [isDirty]),
  )

  function handleChange(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleLocalizedChange(locale: string, name: string, value: unknown) {
    setValues((prev: any) => {
      const next: any = { ...(prev || {}) }
      if (!next.localized || typeof next.localized !== 'object') next.localized = {}
      next.localized[locale] = { ...(next.localized[locale] || {}) }
      next.localized[locale][name] = value
      return next
    })
  }

  function toggleLocalization(enabled: boolean) {
    setLocalizationEnabled(enabled)
    setValues((prev: any) => {
      const next: any = { ...(prev || {}) }
      if (!next.localized || typeof next.localized !== 'object') next.localized = {}
      if (!next.localized._meta) next.localized._meta = {}
      if (enabled && defaultLocale) {
        // Enabling: if no localized bucket for defaultLocale, copy top-level values into it
        if (!next.localized[defaultLocale]) {
          next.localized[defaultLocale] = {}
          if (ct && ct.fields) {
            ct.fields.forEach((f) => {
              if (['string', 'text', 'richtext'].includes(f.type)) {
                const v = next[f.name]
                if (v !== undefined && v !== null && v !== '')
                  next.localized[defaultLocale][f.name] = v
              }
            })
          }
        }
        next.localized._meta.primary = defaultLocale
      } else if (!enabled && defaultLocale) {
        // Disabling: copy values from localized[defaultLocale] back to top-level fields
        const src =
          next.localized && next.localized[defaultLocale] ? next.localized[defaultLocale] : null
        if (src && ct && ct.fields) {
          ct.fields.forEach((f) => {
            if (['string', 'text', 'richtext', 'uid'].includes(f.type)) {
              const v = src[f.name]
              if (v !== undefined) next[f.name] = v
            }
          })
        }
      }
      next.localized._meta.enabled = enabled
      return next
    })
  }

  function openScheduler() {
    // Pre-fill with existing scheduled_for or sensible defaults
    if (scheduledFor) {
      setSchedDate(new Date(scheduledFor))
      setSchedTime(getTimeInTimezone(scheduledFor, timezone))
    } else {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setSchedDate(tomorrow)
      setSchedTime('09:00')
    }
    setShowScheduler(true)
  }

  async function saveFields(): Promise<Entry | null> {
    if (!slug || !ct) return null
    const body: Record<string, unknown> = {}
    // When localization is enabled, prefer values from localized[defaultLocale]
    const localizedDefault: Record<string, unknown> | null =
      localizationEnabled &&
      values.localized &&
      typeof values.localized === 'object' &&
      (values.localized as Record<string, any>)[defaultLocale]
        ? ((values.localized as Record<string, any>)[defaultLocale] as Record<string, unknown>)
        : null

    ct.fields.forEach((f) => {
      let v = (values as any)[f.name]
      if (
        (v === undefined || v === null || v === '') &&
        localizedDefault &&
        localizedDefault[f.name] !== undefined
      ) {
        v = localizedDefault[f.name]
      }
      if (f.type === 'media' && v === null) {
        body[f.name] = null
      } else if (v !== '' && v !== null && v !== undefined) {
        body[f.name] = v
      }
    })
    // Include localized object when present
    if (values.localized && Object.keys(values.localized as Record<string, unknown>).length > 0) {
      // ensure meta
      // @ts-ignore
      if (!values.localized._meta) values.localized._meta = {}
      // @ts-ignore
      values.localized._meta.enabled = localizationEnabled
      // @ts-ignore
      values.localized._meta.primary = defaultLocale
      // @ts-ignore
      body.localized = values.localized
    }

    try {
      const saved = await request(
        isNew ? `/cms/admin/content-types/${slug}/entries` : `/cms/admin/entries/${slug}/${id}`,
        isNew ? 'POST' : 'PUT',
        body,
      )
      original.current = JSON.stringify(values)
      return saved
    } catch {
      return null
    }
  }

  async function handleSaveDraft() {
    const saved = await saveFields()
    if (!saved) return

    if (status === 'scheduled') {
      const entryId = isNew ? (saved.id as string) : id!
      try {
        await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', {
          status: 'draft',
        })
        setStatus('draft')
        setScheduledFor('')
        setShowScheduler(false)
      } catch {
        // surfaced by useApi
      }
    } else if (status === 'published') {
      setIsPublishedStale(true)
    }

    if (isNew) {
      skipBlocker.current = true
      navigate(`/content/${slug}/${saved.id}`, { replace: true })
    }
  }

  async function handlePublish() {
    if (!slug) return

    let entryId = id
    if (isDirty || isNew) {
      const saved = await saveFields()
      if (!saved) return
      entryId = isNew ? (saved.id as string) : id!
      if (isNew) skipBlocker.current = true
    }

    try {
      await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', {
        status: 'published',
      })
      setStatus('published')
      setScheduledFor('')
      setIsPublishedStale(false)
      setShowScheduler(false)
      if (isNew) navigate(`/content/${slug}/${entryId}`, { replace: true })
    } catch {
      if (isNew && entryId) navigate(`/content/${slug}/${entryId}`, { replace: true })
    }
  }

  async function handleSchedule() {
    if (!slug || !schedDate || !schedTime) return

    const newScheduledFor = combineDateAndTime(schedDate, schedTime, timezone)
    if (new Date(newScheduledFor) <= new Date()) return

    let entryId = id
    if (isDirty || isNew) {
      const saved = await saveFields()
      if (!saved) return
      entryId = isNew ? (saved.id as string) : id!
      if (isNew) skipBlocker.current = true
    }

    try {
      await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', {
        status: 'scheduled',
        scheduled_for: newScheduledFor,
      })
      setStatus('scheduled')
      setScheduledFor(newScheduledFor)
      setShowScheduler(false)
      if (isNew) navigate(`/content/${slug}/${entryId}`, { replace: true })
    } catch {
      if (isNew && entryId) navigate(`/content/${slug}/${entryId}`, { replace: true })
    }
  }

  async function handleRevertToDraft() {
    if (!slug || !id) return
    try {
      await requestStatus(`/cms/admin/entries/${slug}/${id}/status`, 'PATCH', { status: 'draft' })
      setStatus('draft')
      setScheduledFor('')
      setIsPublishedStale(false)
    } catch {
      // surfaced by useApi
    }
  }

  async function handleDelete() {
    if (!slug || !id) return
    try {
      await requestDelete(`/cms/admin/entries/${slug}/${id}`, 'DELETE')
      skipBlocker.current = true
      navigate(`/content/${slug}`, { replace: true })
    } catch {
      // surfaced by useApi
    }
  }

  const loading = loadingCt || (!isNew && loadingEntry)
  const busy = saving || patching
  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canDeleteEntries = permissions.includes('*') || permissions.includes('entries:delete')
  const isUserRole = user?.role?.toLowerCase() === 'user'
  const isReadOnlySingle = isUserRole && ct?.kind === 'single'
  const readOnly = !canWriteEntries || isReadOnlySingle
  const canPublish = isDirty || status === 'draft' || status === 'scheduled' || isPublishedStale
  const canSchedule = !!(schedDate && schedTime)

  const saveDraftEnabled = !readOnly && !busy && (status === 'scheduled' ? true : isDirty)
  useKeyboardShortcut('mod+s', handleSaveDraft, { enabled: saveDraftEnabled, label: 'Save draft' })
  useKeyboardShortcut('mod+shift+p', handlePublish, {
    enabled: canPublish && !busy && !readOnly,
    label: 'Publish',
  })

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!ct) return null

  // Status badge

  let statusBadge: React.ReactNode
  if (status === 'scheduled') {
    statusBadge = (
      <Badge variant="outline" className="border-blue-500 text-blue-600">
        <CalendarClockIcon className="size-3 mr-1" />
        {scheduledFor ? `Scheduled · ${formatDatetime(scheduledFor, timezone)}` : 'Scheduled'}
      </Badge>
    )
  } else if (status === 'published') {
    statusBadge = (
      <Badge variant={isPublishedStale ? 'secondary' : 'default'}>
        {isPublishedStale ? 'Published (pending changes)' : 'Published'}
      </Badge>
    )
  } else {
    statusBadge = <Badge variant="secondary">Draft</Badge>
  }

  return (
    <>
      {/* Header */}
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold -mt-2">{isNew ? 'New entry' : 'Edit entry'}</h1>
              {statusBadge}
            </div>
            <p className="text-muted-foreground text-xs mt-1">{ct.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isNew && canDeleteEntries && !isReadOnlySingle && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleting}
              >
                <Trash2Icon className="size-4" />
              </Button>
            )}
            {!isNew && status === 'published' && !readOnly && (
              <Button variant="outline" onClick={handleRevertToDraft} disabled={busy}>
                {patching ? <Spinner className="size-4" /> : null}
                Revert to draft
              </Button>
            )}
            {!isNew && status === 'scheduled' && !readOnly && (
              <Button variant="outline" onClick={handleRevertToDraft} disabled={busy}>
                {patching ? <Spinner className="size-4" /> : null}
                Cancel schedule
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={readOnly || (status === 'scheduled' ? busy : !isDirty || busy)}
            >
              {saving ? <Spinner className="size-4" /> : null}
              {status === 'scheduled' ? 'Save draft (cancel schedule)' : 'Save draft'}
            </Button>
            {status !== 'scheduled' && (
              <Button variant="outline" onClick={openScheduler} disabled={readOnly || busy}>
                <CalendarClockIcon className="size-4" />
                Schedule
              </Button>
            )}
            <Button onClick={handlePublish} disabled={readOnly || !canPublish || busy}>
              {patching ? <Spinner className="size-4" /> : null}
              {status === 'scheduled'
                ? 'Publish now'
                : status === 'published' && !isPublishedStale
                  ? 'Republish'
                  : 'Publish'}
            </Button>
          </div>
        </div>
      </HeaderFixed>

      <section className="mt-24">
        {/* Inline scheduler panel */}
        {showScheduler && !readOnly && (
          <div className="mb-6 flex items-end gap-2 rounded-lg border p-4 bg-muted/30">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-40 justify-between font-normal">
                    {schedDate ? format(schedDate, 'MMM d, yyyy') : 'Select date'}
                    <ChevronDownIcon className="size-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={schedDate}
                    captionLayout="dropdown"
                    defaultMonth={schedDate ?? new Date()}
                    disabled={{ before: new Date() }}
                    onSelect={(d) => {
                      setSchedDate(d)
                      setCalOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>
                Time <span className="text-muted-foreground font-normal">(24h)</span>
              </Label>
              <Input
                type="time"
                className="w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                value={schedTime}
                onChange={(e) => setSchedTime(e.target.value)}
              />
            </div>
            <Button onClick={handleSchedule} disabled={!canSchedule || busy}>
              {patching ? <Spinner className="size-4" /> : null}
              Confirm
            </Button>
            <Button variant="ghost" onClick={() => setShowScheduler(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Fields grid */}
        {/* Localization controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={localizationEnabled}
                onCheckedChange={toggleLocalization}
                disabled={readOnly}
              />
              <div>
                <p className="text-sm font-medium">Localization</p>
                <p className="text-xs text-muted-foreground">Enable per-entry localization</p>
              </div>
            </div>
            <div />
          </div>
          <div>
            {localizationEnabled && (
              <Tabs value={activeLocale} onValueChange={(v) => setActiveLocale(v)}>
                <TabsList>
                  {locales.map((l) => (
                    <TabsTrigger key={l} value={l} disabled={readOnly}>
                      {l.toUpperCase()}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {ct.fields.map((field) => {
            const isLocalizable = ['string', 'text', 'richtext'].includes(field.type)
            const localizedValue =
              values.localized && (values.localized as any)[activeLocale]
                ? (values.localized as any)[activeLocale][field.name]
                : undefined
            const renderValue =
              isLocalizable && localizationEnabled ? localizedValue : values[field.name]
            // Disable UID when it derives from a localized target field
            const uidDisabled =
              field.type === 'uid' &&
              field.targetField &&
              localizationEnabled &&
              ['string', 'text', 'richtext'].includes(
                ct.fields.find((f) => f.name === field.targetField)?.type ?? '',
              )

            return (
              <div
                key={field.name}
                className={FIELD_WIDTH_SPAN[(field.width as FieldWidth) ?? 'full']}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`entry-${field.name}`} className="capitalize">
                    {field.name.replace(/_/g, ' ')}
                    {field.required && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <FieldInput
                    field={field}
                    value={renderValue}
                    onChange={(v) => {
                      if (isLocalizable && localizationEnabled)
                        handleLocalizedChange(activeLocale, field.name, v)
                      else handleChange(field.name, v)
                    }}
                    allValues={{
                      ...values,
                      id,
                      __activeLocale: activeLocale,
                      __localizationEnabled: localizationEnabled,
                      __defaultLocale: defaultLocale,
                    }}
                    disabled={Boolean(uidDisabled) || readOnly}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Delete confirmation */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete this entry?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Spinner className="size-4" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unsaved changes blocker */}
        <Dialog open={blocker.state === 'blocked'} onOpenChange={() => blocker.reset?.()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Unsaved changes</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Leave without saving?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => blocker.reset?.()}>
                Stay
              </Button>
              <Button variant="destructive" onClick={() => blocker.proceed?.()}>
                Leave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </>
  )
}
