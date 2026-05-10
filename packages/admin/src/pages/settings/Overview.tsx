import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx'
import { MediaSettings } from './media/MediaSettings.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Input } from '@/components/ui/input.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { useSettings } from '@/context/settings.tsx'
import { useAuth } from '@/context/auth.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { toast } from 'sonner'
import pkg from '../../../package.json'
import HeaderFixed from '@/components/Header.tsx'
import { parsePreviewConfig } from '@/lib/preview.ts'

const TIMEZONES = [
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York', label: 'America/New_York — Eastern Time (UTC-5/4)' },
  { value: 'America/Chicago', label: 'America/Chicago — Central Time (UTC-6/5)' },
  { value: 'America/Denver', label: 'America/Denver — Mountain Time (UTC-7/6)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — Pacific Time (UTC-8/7)' },
  { value: 'America/Anchorage', label: 'America/Anchorage — Alaska Time (UTC-9/8)' },
  { value: 'America/Honolulu', label: 'America/Honolulu — Hawaii Time (UTC-10)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City — Mexico City (UTC-6/5)' },
  { value: 'America/El_Salvador', label: 'America/El_Salvador — El Salvador (UTC-6)' },
  { value: 'America/Bogota', label: 'America/Bogota — Colombia Time (UTC-5)' },
  { value: 'America/Lima', label: 'America/Lima — Peru Time (UTC-5)' },
  { value: 'America/Santiago', label: 'America/Santiago — Chile Time (UTC-4/3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Buenos_Aires — Argentina (UTC-3)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo — Brasília Time (UTC-3/2)' },
  { value: 'Atlantic/Reykjavik', label: 'Atlantic/Reykjavik — Iceland (UTC+0)' },
  { value: 'Europe/London', label: 'Europe/London — GMT/BST (UTC+0/1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris — Central European Time (UTC+1/2)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin — Central European Time (UTC+1/2)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid — Central European Time (UTC+1/2)' },
  { value: 'Europe/Rome', label: 'Europe/Rome — Central European Time (UTC+1/2)' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki — Eastern European Time (UTC+2/3)' },
  { value: 'Europe/Istanbul', label: 'Europe/Istanbul — Turkey Time (UTC+3)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow — Moscow Standard Time (UTC+3)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai — Gulf Standard Time (UTC+4)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi — Pakistan Standard Time (UTC+5)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata — India Standard Time (UTC+5:30)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka — Bangladesh Standard Time (UTC+6)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok — Indochina Time (UTC+7)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore — Singapore Time (UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai — China Standard Time (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo — Japan Standard Time (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul — Korea Standard Time (UTC+9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney — AEST/AEDT (UTC+10/11)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne — AEST/AEDT (UTC+10/11)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland — New Zealand (UTC+12/13)' },
]

function GeneralSettings() {
  const { user } = useAuth()
  const { data, loading } = useFetch<Record<string, string>>('/cms/admin/settings/general')
  const { request: saveTimezoneRequest, loading: savingTimezone } = useApi()
  const { request: saveLocalesRequest, loading: savingLocales } = useApi()
  const { request: saveEditorialRequest, loading: savingEditorial } = useApi()
  const { refreshSettings } = useSettings()

  const [timezone, setTimezone] = useState('UTC')
  const [locales, setLocales] = useState<string[]>([])
  const [defaultLocale, setDefaultLocale] = useState<string>('en')
  const [newLocale, setNewLocale] = useState<string>('')
  const [editorialMode, setEditorialMode] = useState(false)
  const permissions = user?.permissions ?? []
  const canWriteOverview =
    permissions.includes('*') || permissions.includes('settings:overview:write')

  useEffect(() => {
    if (data?.timezone) setTimezone(data.timezone)
    if (data?.locales) {
      try {
        const parsed = JSON.parse(data.locales)
        if (Array.isArray(parsed)) setLocales(parsed)
      } catch {
        setLocales(
          (data.locales || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    }
    if (data?.default_locale) setDefaultLocale(data.default_locale)
    setEditorialMode(String(data?.editorial_mode ?? 'false').toLowerCase() === 'true')
  }, [data])

  async function handleSaveLocales() {
    try {
      await saveLocalesRequest('/cms/admin/settings/general', 'PUT', {
        locales: JSON.stringify(locales),
        default_locale: defaultLocale,
      })
      refreshSettings()
      toast.success('Locales saved')
    } catch {
      toast.error('Could not save locales')
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-4 py-2">
          <img
            src={`${import.meta.env.BASE_URL}plank-logo-w.svg`}
            alt="Plank CMS"
            className="h-10 w-auto"
          />
          <div>
            <p className="font-bold">Plank CMS by AM25</p>
            <p className="text-sm text-muted-foreground">Version {pkg.version}</p>
          </div>
        </CardContent>
      </Card>

      <div className="border-b pb-4">
        <h2 className="text-2xl font-semibold">Commons</h2>
        <p className="text-sm text-muted-foreground">General settings that apply across the CMS.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={(next) => {
            setTimezone(next)
            void (async () => {
              try {
                await saveTimezoneRequest('/cms/admin/settings/general', 'PUT', { timezone: next })
                refreshSettings()
                toast.success('Timezone saved')
              } catch {
                toast.error('Could not save timezone')
              }
            })()
          }}
        >
          <SelectTrigger id="timezone" className="w-full" disabled={!canWriteOverview}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Used to display dates and times across the admin panel.
          </p>
          {savingTimezone && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Locales</Label>
          <div className="flex items-center gap-2">
            <Input
              placeholder={`E.g. "en"`}
              value={newLocale}
              onChange={(e) => setNewLocale(e.target.value)}
              className="h-9 w-full"
              disabled={!canWriteOverview}
            />
            <Button
              variant="outline"
              className="h-9"
              disabled={!canWriteOverview}
              onClick={() => {
                const code = newLocale.trim().toLowerCase()
                if (!code) return
                if (!locales.includes(code)) setLocales((s) => [...s, code])
                setNewLocale('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {locales.map((l) => (
              <Button
                key={l}
                variant="ghost"
                size="sm"
                onClick={() => setLocales((s) => s.filter((x) => x !== l))}
                disabled={!canWriteOverview}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default-locale">Default locale</Label>
          <Select value={defaultLocale} onValueChange={setDefaultLocale}>
            <SelectTrigger id="default-locale" className="w-full" disabled={!canWriteOverview}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {locales.length === 0 ? (
                <SelectItem value={defaultLocale}>{defaultLocale}</SelectItem>
              ) : (
                locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l.toUpperCase()}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <div className="pt-2 flex justify-end">
            <Button
              variant="outline"
              onClick={handleSaveLocales}
              disabled={savingLocales || !canWriteOverview}
            >
              {savingLocales ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="editorial-mode">Editorial Mode</Label>
          <p className="text-xs text-muted-foreground">
            Enables Editor and Viewer workflows for editorial review.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="editorial-mode"
            checked={editorialMode}
            onCheckedChange={(next) => {
              setEditorialMode(next)
              void (async () => {
                try {
                  await saveEditorialRequest('/cms/admin/settings/general', 'PUT', {
                    editorial_mode: String(next),
                  })
                  refreshSettings()
                  toast.success('Editorial Mode saved')
                } catch {
                  toast.error('Could not save Editorial Mode')
                }
              })()
            }}
            disabled={!canWriteOverview}
          />
          {savingEditorial && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      </div>
    </div>
  )
}

function PreviewSettings() {
  const { user } = useAuth()
  const { data, loading } = useFetch<Record<string, string>>('/cms/admin/settings/preview')
  const { request: savePreviewRequest, loading: savingPreview } = useApi()
  const permissions = user?.permissions ?? []
  const canWriteOverview =
    permissions.includes('*') || permissions.includes('settings:overview:write')

  const [enabled, setEnabled] = useState(false)
  const [urlTemplate, setUrlTemplate] = useState('')
  const [slugField, setSlugField] = useState('slug')

  useEffect(() => {
    const parsed = parsePreviewConfig(data)
    setEnabled(parsed.enabled)
    setUrlTemplate(parsed.urlTemplate)
    setSlugField(parsed.slugField)
  }, [data])

  async function handleSavePreview(e: React.SyntheticEvent) {
    e.preventDefault()
    try {
      await savePreviewRequest('/cms/admin/settings/preview', 'PUT', {
        enabled: String(enabled),
        url_template: urlTemplate.trim(),
        slug_field: slugField.trim() || 'slug',
      })
      toast.success('Preview settings saved')
    } catch {
      toast.error('Could not save preview settings')
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-semibold">Live Preview</h2>
        <p className="text-sm text-muted-foreground">
          Configure a single frontend preview target that Plank can open and sync after saves.
        </p>
      </div>

      <form onSubmit={handleSavePreview} className="space-y-6">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="preview-enabled">Enable preview integration</Label>
            <p className="text-xs text-muted-foreground">
              Shows the preview action in the entry editor and syncs a connected frontend tab.
            </p>
          </div>
          <Switch
            id="preview-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canWriteOverview}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preview-url-template">Preview URL template</Label>
          <Input
            id="preview-url-template"
            value={urlTemplate}
            onChange={(e) => setUrlTemplate(e.target.value)}
            placeholder="https://frontend.example.com/draft/{slug}"
            disabled={!canWriteOverview}
          />
          <p className="text-xs text-muted-foreground">
            Supported placeholders: {'{contentType}'}, {'{entryId}'}, {'{slug}'}, {'{status}'}.
            The final result must be an absolute URL.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preview-slug-field">Slug field</Label>
          <Input
            id="preview-slug-field"
            value={slugField}
            onChange={(e) => setSlugField(e.target.value)}
            placeholder="slug"
            disabled={!canWriteOverview}
          />
          <p className="text-xs text-muted-foreground">
            Used when the template contains {'{slug}'}. Defaults to <code>slug</code>.
          </p>
        </div>

        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Example: <code>https://frontend.example.com/draft/{'{slug}'}</code>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="outline" disabled={savingPreview || !canWriteOverview}>
            {savingPreview ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function SettingsOverview() {
  return (
    <>
      <HeaderFixed>
        <h1 className="text-2xl font-bold -mt-2">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          General configuration for your CMS instance.
        </p>
      </HeaderFixed>

      <Tabs defaultValue="general" className="mt-24">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="media">Media Library</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="preview">
          <PreviewSettings />
        </TabsContent>

        <TabsContent value="media">
          <MediaSettings />
        </TabsContent>
      </Tabs>
    </>
  )
}
