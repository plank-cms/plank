import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx'
import { MediaSettings } from './media/MediaSettings.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
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
import { useSettings } from '@/context/settings.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import pkg from '../../../package.json'
import HeaderFixed from '@/components/Header.tsx'

// Common IANA timezone identifiers with friendly labels
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

// GeneralSettings

function GeneralSettings() {
  const { data, loading } = useFetch<Record<string, string>>('/cms/admin/settings/general')
  const { request, loading: saving } = useApi()
  const { refreshSettings } = useSettings()

  const [timezone, setTimezone] = useState('UTC')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data?.timezone) setTimezone(data.timezone)
  }, [data])

  async function handleSave() {
    await request('/cms/admin/settings/general', 'PUT', { timezone })
    refreshSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone" className="w-1/2">
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
        <p className="text-xs text-muted-foreground">
          Used to display dates and times across the admin panel.
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

// SettingsOverview

export function SettingsOverview() {
  return (
    <>
      <HeaderFixed sidebar>
        <h1 className="text-2xl font-bold -mt-2">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          General configuration for your CMS instance.
        </p>
      </HeaderFixed>

      <Tabs defaultValue="general" className="mt-24">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="media">Media Library</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="media">
          <MediaSettings />
        </TabsContent>
      </Tabs>
    </>
  )
}
