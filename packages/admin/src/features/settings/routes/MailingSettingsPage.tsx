import { useState } from 'react'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useApi } from '@/shared/hooks/useApi.ts'
import { useAuth } from '@/shared/context/auth.tsx'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import { Switch } from '@/shared/ui/switch.tsx'

type Settings = Record<string, string>

const MASKED = '••••••••'

function SecretInput({
  id,
  label,
  fieldKey,
  values,
  onChange,
  placeholder,
  disabled = false,
}: {
  id: string
  label: string
  fieldKey: string
  values: Settings
  onChange: (key: string, value: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const isAlreadySet = values[fieldKey] === MASKED
  const value = values[fieldKey] ?? ''

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={isAlreadySet ? 'Leave blank to keep current value' : placeholder}
          value={isAlreadySet ? '' : value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="pr-9"
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          disabled={disabled}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      {isAlreadySet && (
        <p className="text-xs text-muted-foreground">
          A value is already saved. Enter a new one to replace it.
        </p>
      )}
    </div>
  )
}

export function MailingSettings() {
  const { user } = useAuth()
  const { data: saved, loading } = useFetch<Settings>('/cms/admin/settings/mailing')
  const { loading: saving, error, request } = useApi<Settings>()

  const [localValues, setLocalValues] = useState<Settings | null>(null)
  const [saved_, setSaved] = useState(false)

  const values: Settings = localValues ?? saved ?? { enabled: 'false', 'smtp.port': '587' }
  const enabled = String(values.enabled ?? 'false').toLowerCase() === 'true'
  const secure = String(values['smtp.secure'] ?? 'false').toLowerCase() === 'true'
  const permissions = user?.permissions ?? []
  const canWriteOverview =
    permissions.includes('*') || permissions.includes('settings:overview:write')

  function handleChange(key: string, value: string) {
    setLocalValues({ ...values, [key]: value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await request('/cms/admin/settings/mailing', 'PUT', values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      toast.success('Mailing settings saved')
    } catch {
      toast.error('Could not save mailing settings')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading settings…</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-semibold">Mailing</h2>
        <p className="text-sm text-muted-foreground">
          Configure SMTP for transactional emails such as password recovery.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="mailing-enabled">Enable transactional email</Label>
          <p className="text-xs text-muted-foreground">
            Plank will use these SMTP settings when an email needs to be sent.
          </p>
        </div>
        <Switch
          id="mailing-enabled"
          checked={enabled}
          onCheckedChange={(next) => handleChange('enabled', String(next))}
          disabled={!canWriteOverview}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-host">SMTP host</Label>
          <Input
            id="smtp-host"
            placeholder="smtp.postmarkapp.com"
            value={values['smtp.host'] ?? ''}
            onChange={(e) => handleChange('smtp.host', e.target.value)}
            disabled={!canWriteOverview}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-port">SMTP port</Label>
          <Input
            id="smtp-port"
            inputMode="numeric"
            placeholder="587"
            value={values['smtp.port'] ?? ''}
            onChange={(e) => handleChange('smtp.port', e.target.value)}
            disabled={!canWriteOverview}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-user">SMTP username</Label>
          <Input
            id="smtp-user"
            placeholder="Postmark server token"
            value={values['smtp.user'] ?? ''}
            onChange={(e) => handleChange('smtp.user', e.target.value)}
            disabled={!canWriteOverview}
          />
        </div>
        <SecretInput
          id="smtp-password"
          label="SMTP password"
          fieldKey="smtp.password"
          values={values}
          onChange={handleChange}
          placeholder="Postmark server token"
          disabled={!canWriteOverview}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="smtp-secure">Use secure connection</Label>
          <p className="text-xs text-muted-foreground">
            Enable for SMTPS on port 465. Leave off for STARTTLS on port 587.
          </p>
        </div>
        <Switch
          id="smtp-secure"
          checked={secure}
          onCheckedChange={(next) => handleChange('smtp.secure', String(next))}
          disabled={!canWriteOverview}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mail-from-name">From name</Label>
          <Input
            id="mail-from-name"
            placeholder="Plank CMS"
            value={values['from.name'] ?? ''}
            onChange={(e) => handleChange('from.name', e.target.value)}
            disabled={!canWriteOverview}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail-from-email">From email</Label>
          <Input
            id="mail-from-email"
            type="email"
            placeholder="no-reply@example.com"
            value={values['from.email'] ?? ''}
            onChange={(e) => handleChange('from.email', e.target.value)}
            disabled={!canWriteOverview}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mail-reply-to">Reply-to email</Label>
        <Input
          id="mail-reply-to"
          type="email"
          placeholder="support@example.com"
          value={values['reply_to'] ?? ''}
          onChange={(e) => handleChange('reply_to', e.target.value)}
          disabled={!canWriteOverview}
        />
        <p className="text-xs text-muted-foreground">Optional. Leave blank to omit Reply-To.</p>
      </div>

      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Postmark example: host <code>smtp.postmarkapp.com</code>, port <code>587</code>, username
        and password set to your server token.
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !canWriteOverview}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved_ && <p className="text-sm text-muted-foreground">Changes saved.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  )
}
