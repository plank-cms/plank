import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Trash2Icon,
  CalendarClockIcon,
  ChevronDownIcon,
  PencilIcon,
  XIcon,
  SaveIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut.ts'
import { useSettings } from '@/context/settings.tsx'
import { useAuth } from '@/context/auth.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Calendar } from '@/components/ui/calendar.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
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
import {
  PREVIEW_WINDOW_NAME,
  getPreviewSetupError,
  parsePreviewClientSettings,
  resolvePreviewUrl,
  withPreviewNonce,
} from '@/lib/preview.ts'
import HeaderFixed from '@/components/Header'
import { UserAvatar } from '@/components/ui/custom/UserAvatar.tsx'

type ContentType = {
  name: string
  slug: string
  kind: 'collection' | 'single'
  fields: FieldDef[]
}

type Entry = Record<string, unknown> & {
  id?: string
  created_by?: string | null
  status?: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  published_data?: Record<string, unknown> | null
  scheduled_for?: string | null
  editor_id?: string | null
  review_locked_by_editor?: boolean
  review_rejected?: boolean
  _editor_first_name?: string | null
  _editor_last_name?: string | null
  _editor_avatar_url?: string | null
}

type UserOption = {
  id: string
  role_name?: string
  first_name?: string | null
  last_name?: string | null
}

type LocalizedMeta = { enabled?: boolean; primary?: string }
type LocalizedData = Record<string, unknown> & { _meta?: LocalizedMeta }

let previewWindowRef: Window | null = null

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stableValue(v)]),
    )
  }
  return value
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function parseDuplicatedFieldName(errorMessage: string): string | null {
  const match = errorMessage.match(/Field "([^"]+)" already exists\.?/)
  if (!match) return null
  return match[1] ?? null
}

export function EntryForm() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const navigate = useNavigate()
  const isNew = !id
  const { timezone, locales: settingsLocales, defaultLocale, editorialMode } = useSettings()
  const { user, status: authStatus } = useAuth()
  const role = user?.role?.toLowerCase() ?? ''

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null,
  )
  const { data: previewSettings } = useFetch<Record<string, string>>('/cms/admin/client-settings')
  const { data: existing, loading: loadingEntry } = useFetch<Entry>(
    slug && id ? `/cms/admin/entries/${slug}/${id}` : null,
  )
  const reviewerPickerEnabled =
    editorialMode && ['editor', 'admin', 'super admin'].includes(user?.role?.toLowerCase() ?? '')
  const { data: users } = useFetch<UserOption[]>(reviewerPickerEnabled ? '/cms/admin/users' : null)

  const { loading: saving, request } = useApi<Entry>()
  const { loading: patching, request: requestStatus } = useApi<Entry>()
  const { loading: deleting, request: requestDelete } = useApi()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [locales, setLocales] = useState<string[]>([])
  const [activeLocale, setActiveLocale] = useState<string>('')
  const [localizationEnabled, setLocalizationEnabled] = useState<boolean>(false)
  // newLocale removed: locales now managed in Settings > Overview > General
  const [status, setStatus] = useState<
    'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  >('draft')
  const [scheduledFor, setScheduledFor] = useState<string>('')
  const [isPublishedStale, setIsPublishedStale] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [reviewRejected, setReviewRejected] = useState(false)
  const [assignedEditorId, setAssignedEditorId] = useState<string | null>(null)
  const [assignedEditorFirstName, setAssignedEditorFirstName] = useState<string | null>(null)
  const [assignedEditorLastName, setAssignedEditorLastName] = useState<string | null>(null)
  const [assignedEditorAvatarUrl, setAssignedEditorAvatarUrl] = useState<string | null>(null)
  const [reviewEditEnabled, setReviewEditEnabled] = useState(false)
  const [uidErrorField, setUidErrorField] = useState<string | null>(null)

  // Scheduler panel state
  const [showScheduler, setShowScheduler] = useState(false)
  const [calOpen, setCalOpen] = useState(false)
  const [schedDate, setSchedDate] = useState<Date | undefined>()
  const [schedTime, setSchedTime] = useState('09:00')

  const original = useRef<string>('{}')
  const skipBlocker = useRef(false)

  const previewConfig = parsePreviewClientSettings(previewSettings)
  const previewSetupError = ct
    ? getPreviewSetupError(
        previewConfig,
        ct.fields.map((field) => field.name),
      )
    : null
  const previewAvailable = previewConfig.enabled && !previewSetupError
  const previewHint =
    previewConfig.enabled && previewSetupError
      ? previewSetupError
      : previewConfig.enabled
        ? null
        : 'Preview is disabled. Configure Settings > Overview > Preview to enable it.'

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
      setReviewRejected(false)
      setAssignedEditorId(null)
      setAssignedEditorFirstName(null)
      setAssignedEditorLastName(null)
      setAssignedEditorAvatarUrl(null)
      setReviewEditEnabled(false)
      setUidErrorField(null)
      original.current = stableStringify(empty)
      return
    }
    if (!existing || !ct) return

    const initial: Record<string, unknown> = {}
    ct.fields.forEach((f) => {
      initial[f.name] = existing[f.name] ?? (f.type === 'boolean' ? false : '')
    })
    // localized values
    // normalize to a plain object so TS doesn't treat it as `unknown`
    const rawLocalized = existing.localized
    const localizedObj: LocalizedData =
      rawLocalized && typeof rawLocalized === 'object' ? (rawLocalized as LocalizedData) : {}
    initial.localized = localizedObj
    const detectedLocales = Object.keys(localizedObj).filter((k) => !k.startsWith('_'))
    const meta = localizedObj._meta || {}
    const enabled = meta.enabled ?? detectedLocales.length > 0
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
    setReviewRejected(Boolean(existing.review_rejected))
    setAssignedEditorId(existing.editor_id ?? null)
    setAssignedEditorFirstName(existing._editor_first_name ?? null)
    setAssignedEditorLastName(existing._editor_last_name ?? null)
    setAssignedEditorAvatarUrl(existing._editor_avatar_url ?? null)
    setReviewEditEnabled(false)
    setUidErrorField(null)
    original.current = stableStringify(initial)

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
      setIsPublishedStale(stableStringify(normalizedInitial) !== stableStringify(snap))
    } else {
      setIsPublishedStale(false)
    }
  }, [existing, ct, isNew])

  const isDirty = stableStringify(values) !== original.current

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
    setValues((prev) => {
      const next: Record<string, unknown> = { ...prev }
      const localized: LocalizedData =
        next.localized && typeof next.localized === 'object'
          ? (next.localized as LocalizedData)
          : {}
      const localeBucket =
        localized[locale] && typeof localized[locale] === 'object'
          ? (localized[locale] as Record<string, unknown>)
          : {}
      localeBucket[name] = value
      localized[locale] = localeBucket
      next.localized = localized
      return next
    })
  }

  function toggleLocalization(enabled: boolean) {
    setLocalizationEnabled(enabled)
    setValues((prev) => {
      const next: Record<string, unknown> = { ...prev }
      const localized: LocalizedData =
        next.localized && typeof next.localized === 'object'
          ? (next.localized as LocalizedData)
          : {}
      if (!localized._meta) localized._meta = {}
      if (enabled && defaultLocale) {
        // Enabling: if no localized bucket for defaultLocale, copy top-level values into it
        const existingDefault =
          localized[defaultLocale] && typeof localized[defaultLocale] === 'object'
            ? (localized[defaultLocale] as Record<string, unknown>)
            : null
        if (!existingDefault) {
          localized[defaultLocale] = {}
          if (ct && ct.fields) {
            const defaultBucket = localized[defaultLocale] as Record<string, unknown>
            ct.fields.forEach((f) => {
              if (['string', 'text', 'richtext'].includes(f.type)) {
                const v = next[f.name]
                if (v !== undefined && v !== null && v !== '') defaultBucket[f.name] = v
              }
            })
          }
        }
        localized._meta.primary = defaultLocale
      } else if (!enabled && defaultLocale) {
        // Disabling: copy values from localized[defaultLocale] back to top-level fields
        const src =
          localized[defaultLocale] && typeof localized[defaultLocale] === 'object'
            ? (localized[defaultLocale] as Record<string, unknown>)
            : null
        if (src && ct && ct.fields) {
          ct.fields.forEach((f) => {
            if (['string', 'text', 'richtext', 'uid'].includes(f.type)) {
              const v = src[f.name]
              if (v !== undefined) next[f.name] = v
            }
          })
        }
      }
      localized._meta.enabled = enabled
      next.localized = localized
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
    setUidErrorField(null)
    const body: Record<string, unknown> = {}
    // When localization is enabled, prefer values from localized[defaultLocale]
    const localizedDefault: Record<string, unknown> | null =
      localizationEnabled &&
      values.localized &&
      typeof values.localized === 'object' &&
      (values.localized as LocalizedData)[defaultLocale] &&
      typeof (values.localized as LocalizedData)[defaultLocale] === 'object'
        ? ((values.localized as LocalizedData)[defaultLocale] as Record<string, unknown>)
        : null

    ct.fields.forEach((f) => {
      let v = values[f.name]
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
      const localized = values.localized as LocalizedData
      if (!localized._meta) localized._meta = {}
      localized._meta.enabled = localizationEnabled
      localized._meta.primary = defaultLocale
      body.localized = localized
    }

    try {
      const saved = await request(
        isNew ? `/cms/admin/content-types/${slug}/entries` : `/cms/admin/entries/${slug}/${id}`,
        isNew ? 'POST' : 'PUT',
        body,
      )
      original.current = stableStringify(values)
      return saved
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      const duplicatedField = parseDuplicatedFieldName(message)
      if (duplicatedField && ct.fields.some((f) => f.type === 'uid' && f.name === duplicatedField)) {
        setUidErrorField(duplicatedField)
      }
      toast.error('Could not save draft')
      return null
    }
  }

  function syncPreviewWindow(url: string) {
    if (!previewWindowRef || previewWindowRef.closed) return

    const nextUrl = withPreviewNonce(url)

    // Navigating the held window reference is more robust than postMessage for
    // cross-origin previews because it does not depend on origin matching or a
    // client-side listener being mounted correctly.
    previewWindowRef.location.href = nextUrl
    previewWindowRef.focus()
  }

  async function saveDraftAndMaybeSync(
    syncPreview: boolean,
  ): Promise<{ entry: Entry; status: Entry['status'] } | null> {
    const saved = await saveFields()
    if (!saved) return null

    let nextEntry: Entry = saved
    let nextStatus: Entry['status'] = status

    if (status === 'scheduled') {
      const entryId = isNew ? (saved.id as string) : id!
      try {
        const patched = await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', {
          status: 'draft',
        })
        nextEntry = patched
        nextStatus = 'draft'
        setStatus('draft')
        setScheduledFor('')
        setShowScheduler(false)
      } catch {
        toast.error('Could not save draft')
        return null
      }
    } else if (status === 'published') {
      nextStatus = 'published'
      setIsPublishedStale(true)
    }

    if (syncPreview && slug && previewAvailable && !previewConfig.syncUrl) {
      const previewUrl = resolvePreviewUrl({
        config: previewConfig,
        contentType: slug,
        entry: nextEntry,
        status: nextStatus,
      })

      if (previewUrl) syncPreviewWindow(previewUrl)
    }

    toast.success('Draft saved')

    if (isNew) {
      skipBlocker.current = true
      navigate(`/content/${slug}/${nextEntry.id}`, { replace: true })
    }

    return { entry: nextEntry, status: nextStatus }
  }

  async function handleSaveDraft() {
    await saveDraftAndMaybeSync(true)
  }

  async function handleOpenPreview() {
    if (!slug || !ct || !previewConfig.enabled) return

    if (previewSetupError) {
      toast.error(previewSetupError)
      return
    }

    let previewEntry: Entry | null = existing ?? null
    let previewStatus: Entry['status'] = status

    if (isNew || isDirty) {
      const result = await saveDraftAndMaybeSync(false)
      if (!result) return
      previewEntry = result.entry
      previewStatus = result.status
    }

    const fallbackEntry =
      previewEntry ??
      ({
        ...values,
        id,
        status,
      } as Entry)

    const previewUrl = resolvePreviewUrl({
      config: previewConfig,
      contentType: slug,
      entry: fallbackEntry,
      status: previewStatus,
    })

    if (!previewUrl) {
      toast.error('Preview URL could not be resolved for this entry.')
      return
    }

    previewWindowRef = window.open(withPreviewNonce(previewUrl), PREVIEW_WINDOW_NAME)

    if (!previewWindowRef) {
      toast.error('Preview window was blocked by the browser.')
      return
    }

    previewWindowRef.focus()
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

    // If auth profile is temporarily unavailable (e.g. /users/me transient 401),
    // default to the safe editorial path (request review) instead of publish.
    const reviewMode =
      editorialMode && (role === 'contributor' || role === '' || authStatus !== 'authenticated')
    try {
      const patched = await requestStatus(`/cms/admin/entries/${slug}/${entryId}/status`, 'PATCH', {
        status: reviewMode ? 'pending' : 'published',
        review_rejected: false,
      })
      setStatus((patched?.status as Entry['status']) ?? (reviewMode ? 'pending' : 'published'))
      setReviewRejected(Boolean(patched?.review_rejected))
      setAssignedEditorId((patched?.editor_id as string | null | undefined) ?? assignedEditorId)
      setAssignedEditorFirstName(
        (patched?._editor_first_name as string | null | undefined) ?? assignedEditorFirstName,
      )
      setAssignedEditorLastName(
        (patched?._editor_last_name as string | null | undefined) ?? assignedEditorLastName,
      )
      setAssignedEditorAvatarUrl(
        (patched?._editor_avatar_url as string | null | undefined) ?? assignedEditorAvatarUrl,
      )
      setScheduledFor('')
      setIsPublishedStale(false)
      setShowScheduler(false)
      setReviewEditEnabled(false)
      toast.success('Entry published')
      if (isNew) navigate(`/content/${slug}/${entryId}`, { replace: true })
    } catch {
      toast.error('Could not publish entry')
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
      toast.success('Entry scheduled')
      if (isNew) navigate(`/content/${slug}/${entryId}`, { replace: true })
    } catch {
      toast.error('Could not schedule entry')
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
      toast.success('Reverted to draft')
    } catch {
      toast.error('Could not revert entry')
    }
  }

  async function handleDelete() {
    if (!slug || !id) return
    try {
      await requestDelete(`/cms/admin/entries/${slug}/${id}`, 'DELETE')
      toast.success('Entry deleted')
      skipBlocker.current = true
      navigate(`/content/${slug}`, { replace: true })
    } catch {
      toast.error('Could not delete entry')
    }
  }

  async function handleAssignEditor(editorId: string) {
    if (!slug || !id) return
    const nextId = editorId === 'none' ? null : editorId
    try {
      const patched = await requestStatus(`/cms/admin/entries/${slug}/${id}/status`, 'PATCH', {
        status: 'in_review',
        editor_id: nextId,
        review_locked_by_editor: existing?.review_locked_by_editor ?? false,
      })
      setStatus((patched?.status as Entry['status']) ?? 'in_review')
      setReviewRejected(Boolean(patched?.review_rejected))
      setAssignedEditorId((patched?.editor_id as string | null | undefined) ?? nextId)
      setAssignedEditorFirstName((patched?._editor_first_name as string | null | undefined) ?? null)
      setAssignedEditorLastName((patched?._editor_last_name as string | null | undefined) ?? null)
      setAssignedEditorAvatarUrl((patched?._editor_avatar_url as string | null | undefined) ?? null)
      setReviewEditEnabled(false)
      toast.success('Editor assigned')
    } catch {
      toast.error('Could not assign editor')
    }
  }

  async function handleToggleReviewLock() {
    setReviewEditEnabled((prev) => !prev)
  }

  async function handleReject() {
    if (!slug || !id) return
    try {
      const patched = await requestStatus(`/cms/admin/entries/${slug}/${id}/status`, 'PATCH', {
        status: 'pending',
        review_rejected: true,
      })
      setStatus((patched?.status as Entry['status']) ?? 'pending')
      setReviewRejected(Boolean(patched?.review_rejected))
      setReviewEditEnabled(false)
      toast.success('Entry rejected')
    } catch {
      toast.error('Could not reject entry')
    }
  }

  const loading = loadingCt || (!isNew && loadingEntry)
  const busy = saving || patching
  const permissions = user?.permissions ?? []
  const canWriteEntries = permissions.includes('*') || permissions.includes('entries:write')
  const canDeleteEntries = permissions.includes('*') || permissions.includes('entries:delete')
  const isContributorRole = role === 'contributor'
  const isEditorRole = role === 'editor'
  const isAdminOrSuper = ['admin', 'super admin'].includes(role)
  const isViewerRole = role === 'viewer'
  const isOwnershipRestrictedDeleteRole = isContributorRole || isEditorRole
  const isReadOnlySingle = isContributorRole && ct?.kind === 'single'
  const isOwnEntry = isNew || String(existing?.created_by ?? '') === String(user?.id ?? '')
  const contributorInReview = editorialMode && isContributorRole && status === 'in_review'
  const isAssignedReviewer =
    editorialMode &&
    (isEditorRole || isAdminOrSuper) &&
    !!assignedEditorId &&
    assignedEditorId === user?.id
  const reviewerCanEnterEditMode =
    isAssignedReviewer && (status === 'pending' || status === 'in_review') && !reviewRejected
  const reviewerNeedsEditToggle =
    editorialMode &&
    (isEditorRole || isAdminOrSuper) &&
    (status === 'pending' || status === 'in_review')
  const readOnlyForReviewRoles =
    reviewerNeedsEditToggle && (!isAssignedReviewer || !reviewEditEnabled)
  const contributorPendingYellow =
    editorialMode && isContributorRole && status === 'pending' && !reviewRejected
  const readOnlyByOwnership =
    (isContributorRole && !isOwnEntry) ||
    contributorPendingYellow ||
    contributorInReview ||
    readOnlyForReviewRoles
  const readOnly = isViewerRole || !canWriteEntries || isReadOnlySingle || readOnlyByOwnership
  const canDeleteCurrentEntry = canDeleteEntries && (!isOwnershipRestrictedDeleteRole || isOwnEntry)
  const canContributorResubmitPending =
    editorialMode && isContributorRole && status === 'pending' && (reviewRejected ? true : isDirty)
  const canPublish =
    canContributorResubmitPending ||
    isDirty ||
    status === 'draft' ||
    status === 'scheduled' ||
    (!editorialMode && status === 'pending') ||
    (editorialMode && status === 'pending' && !isContributorRole) ||
    (editorialMode && status === 'in_review' && !isContributorRole) ||
    isPublishedStale
  const canSchedule = !!(schedDate && schedTime)
  const publishLabel = editorialMode && isContributorRole ? 'Review' : 'Publish'

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
  } else if (status === 'pending') {
    statusBadge = reviewRejected ? (
      <Badge variant="destructive">Pending</Badge>
    ) : (
      <Badge className="bg-amber-500 text-black hover:bg-amber-500">Pending</Badge>
    )
  } else if (status === 'in_review') {
    statusBadge = <Badge variant="outline">In Review</Badge>
  } else if (status === 'published') {
    statusBadge = (
      <Badge variant={isPublishedStale ? 'secondary' : 'default'}>
        {isPublishedStale ? 'Published (pending changes)' : 'Published'}
      </Badge>
    )
  } else {
    statusBadge = <Badge variant="secondary">Draft</Badge>
  }

  const reviewerCandidates = (users ?? []).filter((u) => {
    if (isEditorRole) return u.id === user?.id
    if (isAdminOrSuper) return u.id === user?.id || (u.role_name ?? '').toLowerCase() === 'editor'
    return false
  })
  const canManageReviewer =
    !isNew &&
    editorialMode &&
    (isEditorRole || isAdminOrSuper) &&
    (status === 'pending' || status === 'in_review')
  const showReviewerControl = editorialMode && !isNew && canManageReviewer
  const showReviewerInfo = editorialMode && !isNew && Boolean(assignedEditorId)
  const showReviewEditButton = reviewerCanEnterEditMode
  const showRejectButton = reviewerCanEnterEditMode
  const reviewerLabel = assignedEditorFirstName || assignedEditorLastName

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
            {previewConfig.enabled && previewSetupError && (
              <p className="mt-1 text-xs text-amber-600">{previewSetupError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && canDeleteCurrentEntry && !isReadOnlySingle && (
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
            {showReviewerControl && (
              <Select
                value={assignedEditorId ?? 'none'}
                onValueChange={handleAssignEditor}
                disabled={!canManageReviewer || busy}
              >
                <SelectTrigger className="h-10 min-h-10 max-h-10 w-42 py-0">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      avatarUrl={assignedEditorAvatarUrl ?? null}
                      firstName={assignedEditorFirstName ?? null}
                      lastName={assignedEditorLastName ?? null}
                      className="size-5"
                      fallbackClassName="text-[9px]"
                    />
                    <SelectValue placeholder={reviewerLabel ? reviewerLabel : 'Assign editor'} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {!isEditorRole && <SelectItem value="none">Unassign</SelectItem>}
                  {reviewerCandidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name || u.last_name || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!canManageReviewer && showReviewerInfo && (
              <div className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm">
                <UserAvatar
                  avatarUrl={assignedEditorAvatarUrl ?? null}
                  firstName={assignedEditorFirstName ?? null}
                  lastName={assignedEditorLastName ?? null}
                  className="size-5"
                  fallbackClassName="text-[9px]"
                />
                <span>{reviewerLabel || 'Assigned editor'}</span>
              </div>
            )}
            {showReviewEditButton && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleReviewLock}
                disabled={busy}
              >
                <PencilIcon className="size-4" />
              </Button>
            )}
            {showRejectButton && (
              <Button variant="outline" size="icon" onClick={handleReject} disabled={busy}>
                <XIcon className="size-4" />
              </Button>
            )}
            {previewConfig.enabled && (
              <Button
                variant="outline"
                onClick={handleOpenPreview}
                disabled={readOnly || busy || Boolean(previewSetupError)}
                title={previewHint ?? undefined}
              >
                Open preview
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              size={editorialMode ? 'icon' : 'default'}
              disabled={readOnly || (status === 'scheduled' ? busy : !isDirty || busy)}
            >
              {saving ? (
                <Spinner className="size-4" />
              ) : editorialMode ? (
                <SaveIcon className="size-4" />
              ) : null}
              {!editorialMode &&
                (status === 'scheduled' ? 'Save draft (cancel schedule)' : 'Save draft')}
            </Button>
            {status !== 'scheduled' && !(editorialMode && isContributorRole) && (
              <Button
                variant="outline"
                onClick={openScheduler}
                size={editorialMode ? 'icon' : 'default'}
                disabled={readOnly || busy}
              >
                <CalendarClockIcon className="size-4" />
                {!editorialMode && 'Schedule'}
              </Button>
            )}
            <Button onClick={handlePublish} disabled={readOnly || !canPublish || busy}>
              {patching ? <Spinner className="size-4" /> : null}
              {status === 'scheduled'
                ? editorialMode && isContributorRole
                  ? 'Review'
                  : 'Publish now'
                : status === 'published' && !isPublishedStale
                  ? 'Republish'
                  : publishLabel}
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
              values.localized && (values.localized as LocalizedData)[activeLocale]
                ? ((values.localized as LocalizedData)[activeLocale] as Record<string, unknown>)[
                    field.name
                  ]
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
                      if (field.type === 'uid' && uidErrorField === field.name) {
                        setUidErrorField(null)
                      }
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
                    errorMessage={
                      field.type === 'uid' && uidErrorField === field.name
                        ? `${field.name} already exists.`
                        : undefined
                    }
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
