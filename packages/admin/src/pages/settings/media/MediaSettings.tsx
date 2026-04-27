import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'

type Provider = 'local' | 's3' | 'r2'
type Settings = Record<string, string>

const MASKED = '••••••••'

// Local fields

function LocalFields({
  values,
  onChange,
}: {
  values: Settings
  onChange: (k: string, v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="local-uploads-dir">Upload directory</Label>
        <Input
          id="local-uploads-dir"
          placeholder="public/uploads"
          value={values['local.uploads_dir'] ?? ''}
          onChange={(e) => onChange('local.uploads_dir', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Path on disk where files are stored. Relative to the server working directory.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="local-public-url">Public URL</Label>
        <Input
          id="local-public-url"
          placeholder="http://localhost:1337"
          value={values['local.public_url'] ?? ''}
          onChange={(e) => onChange('local.public_url', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Base URL used to build file URLs. Should match the server's public address.
        </p>
      </div>
    </div>
  )
}

// Secret input with show/hide toggle

function SecretInput({
  id,
  label,
  fieldKey,
  values,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  fieldKey: string
  values: Settings
  onChange: (k: string, v: string) => void
  placeholder?: string
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
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
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

// S3 fields

function S3Fields({
  values,
  onChange,
}: {
  values: Settings
  onChange: (k: string, v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="s3-access-key">Access key ID</Label>
          <Input
            id="s3-access-key"
            placeholder="AKIAIOSFODNN7EXAMPLE"
            value={values['s3.access_key_id'] ?? ''}
            onChange={(e) => onChange('s3.access_key_id', e.target.value)}
          />
        </div>
        <SecretInput
          id="s3-secret-key"
          label="Secret access key"
          fieldKey="s3.secret_access_key"
          values={values}
          onChange={onChange}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="s3-region">Region</Label>
        <Input
          id="s3-region"
          placeholder="us-east-1"
          value={values['s3.region'] ?? ''}
          onChange={(e) => onChange('s3.region', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="s3-bucket">Bucket</Label>
          <Input
            id="s3-bucket"
            placeholder="my-bucket"
            value={values['s3.bucket'] ?? ''}
            onChange={(e) => onChange('s3.bucket', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s3-path-prefix">Path prefix</Label>
          <Input
            id="s3-path-prefix"
            placeholder="cms/media"
            value={values['s3.path_prefix'] ?? ''}
            onChange={(e) => onChange('s3.path_prefix', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Optional. Shared bucket subfolder.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="s3-public-url">Public URL</Label>
        <Input
          id="s3-public-url"
          placeholder="https://cdn.example.com"
          value={values['s3.public_url'] ?? ''}
          onChange={(e) => onChange('s3.public_url', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Optional. Leave blank to use the default S3 URL.
        </p>
      </div>
    </div>
  )
}

// R2 fields

function R2Fields({
  values,
  onChange,
}: {
  values: Settings
  onChange: (k: string, v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="r2-access-key">Access key ID</Label>
          <Input
            id="r2-access-key"
            placeholder="R2 access key ID"
            value={values['r2.access_key_id'] ?? ''}
            onChange={(e) => onChange('r2.access_key_id', e.target.value)}
          />
        </div>
        <SecretInput
          id="r2-secret-key"
          label="Secret access key"
          fieldKey="r2.secret_access_key"
          values={values}
          onChange={onChange}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="r2-bucket">Bucket</Label>
          <Input
            id="r2-bucket"
            placeholder="my-bucket"
            value={values['r2.bucket'] ?? ''}
            onChange={(e) => onChange('r2.bucket', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r2-path-prefix">Path prefix</Label>
          <Input
            id="r2-path-prefix"
            placeholder="cms/media"
            value={values['r2.path_prefix'] ?? ''}
            onChange={(e) => onChange('r2.path_prefix', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Optional. Shared bucket subfolder.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="r2-public-url">
          Public URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="r2-public-url"
          placeholder="https://assets.example.com"
          value={values['r2.public_url'] ?? ''}
          onChange={(e) => onChange('r2.public_url', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Required. R2 does not generate public URLs automatically.
        </p>
      </div>
    </div>
  )
}

// Main component

export function MediaSettings() {
  const { data: saved, loading } = useFetch<Settings>('/cms/admin/settings/media')
  const { loading: saving, error, request } = useApi<Settings>()

  const [localValues, setLocalValues] = useState<Settings | null>(null)
  const [saved_, setSaved] = useState(false)

  const values: Settings = localValues ?? saved ?? { provider: 'local' }
  const provider = (values['provider'] as Provider) || 'local'

  function handleChange(key: string, value: string) {
    setLocalValues({ ...values, [key]: value })
  }

  function handleProviderChange(p: Provider) {
    setLocalValues({ ...values, provider: p })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await request('/cms/admin/settings/media', 'PUT', values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      /* error shown via error state */
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
        <h2 className="text-2xl font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground">Configure where uploaded files are stored.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="provider">Storage provider</Label>
          <Select value={provider} onValueChange={(v) => handleProviderChange(v as Provider)}>
            <SelectTrigger id="provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="s3">Amazon S3</SelectItem>
              <SelectItem value="r2">Cloudflare R2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {provider === 'r2' && (
          <div className="space-y-1.5">
            <Label htmlFor="r2-account-id">Account ID</Label>
            <Input
              id="r2-account-id"
              placeholder="023e105f4ecef8ad9ca31a8372d0c353"
              value={values['r2.account_id'] ?? ''}
              onChange={(e) => handleChange('r2.account_id', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Found in the Cloudflare dashboard under R2 &gt; Overview.
            </p>
          </div>
        )}
      </div>

      <div className="border-t pt-6">
        {provider === 'local' && <LocalFields values={values} onChange={handleChange} />}
        {provider === 's3' && <S3Fields values={values} onChange={handleChange} />}
        {provider === 'r2' && <R2Fields values={values} onChange={handleChange} />}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved_ && <p className="text-sm text-muted-foreground">Changes saved.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  )
}
