import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useApi } from '@/shared/hooks/useApi.ts'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field.tsx'
import { Input } from '@/shared/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table.tsx'

const endpoint = '/cms/admin/mcp-oauth'
const presets = {
  ChatGPT: 'https://chatgpt.com/connector_platform_oauth_redirect',
  Claude: 'https://claude.ai/api/mcp/auth_callback',
} as const

type Preset = keyof typeof presets | 'custom'
type Client = { clientId: string; name: string; redirectUri: string }
type CreatedClient = Client & { clientSecret: string }
type Settings = { origin: string | null; clients: Client[] }

function Credential({ id, label, value }: { id: string; label: string; value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`)
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} value={value} readOnly />
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          Copy
        </Button>
      </div>
    </Field>
  )
}

function ClientDialog({
  client,
  close,
  refresh,
}: {
  client: Client | null
  close: () => void
  refresh: () => void
}) {
  const { request, loading } = useApi<CreatedClient>()
  const [preset, setPreset] = useState<Preset>('ChatGPT')
  const [name, setName] = useState(client?.name ?? 'ChatGPT')
  const [redirectUri, setRedirectUri] = useState<string>(client?.redirectUri ?? presets.ChatGPT)
  const [created, setCreated] = useState<CreatedClient | null>(null)

  function selectPreset(value: Preset) {
    setPreset(value)
    setName(value === 'custom' ? '' : value)
    setRedirectUri(value === 'custom' ? '' : presets[value])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      if (client) {
        await request(`${endpoint}/clients/${encodeURIComponent(client.clientId)}`, 'PUT', {
          name,
          redirectUri,
        })
        toast.success('OAuth client updated')
        close()
      } else {
        setCreated(await request(`${endpoint}/clients`, 'POST', { name, redirectUri }))
      }
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save OAuth client')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {created ? 'OAuth credentials' : client ? 'Edit OAuth client' : 'New OAuth client'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? 'Copy both values to the MCP client. Plank displays the secret only once.'
              : 'Choose a known redirect URL or enter the exact HTTPS callback for your client.'}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <FieldGroup>
              <Credential id="mcp-oauth-client-id" label="Client ID" value={created.clientId} />
              <Credential
                id="mcp-oauth-client-secret"
                label="Client secret"
                value={created.clientSecret}
              />
            </FieldGroup>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={save}>
            <FieldGroup>
              {!client && (
                <Field>
                  <FieldLabel htmlFor="mcp-oauth-preset">Client</FieldLabel>
                  <Select value={preset} onValueChange={selectPreset}>
                    <SelectTrigger id="mcp-oauth-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                        <SelectItem value="Claude">Claude</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="mcp-oauth-name">Name</FieldLabel>
                <Input
                  id="mcp-oauth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mcp-oauth-redirect">Redirect URL</FieldLabel>
                <Input
                  id="mcp-oauth-redirect"
                  type="url"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  maxLength={2048}
                  required
                />
                {client && (
                  <FieldDescription>
                    Changing the redirect URL revokes existing authorizations for this client.
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {client ? 'Save client' : 'Create client'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function McpOAuthSettings({
  canWrite,
  canDelete,
}: {
  canWrite: boolean
  canDelete: boolean
}) {
  const { data, loading, error, refetch } = useFetch<Settings>(endpoint)
  const { request, loading: saving } = useApi()
  const [editor, setEditor] = useState<{ client: Client | null } | null>(null)
  const [revoking, setRevoking] = useState<Client | null>(null)

  async function saveOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const origin = new FormData(event.currentTarget).get('origin')
    try {
      await request(`${endpoint}/origin`, 'PUT', { origin })
      refetch()
      toast.success('MCP origin saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save MCP origin')
    }
  }

  async function revoke() {
    if (!revoking) return
    try {
      await request(`${endpoint}/clients/${encodeURIComponent(revoking.clientId)}`, 'DELETE')
      setRevoking(null)
      refetch()
      toast.success('OAuth client revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke OAuth client')
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>MCP OAuth</CardTitle>
        <CardDescription>
          Manage OAuth connections for ChatGPT, Claude, and other MCP clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Could not load MCP OAuth settings.
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading MCP OAuth settings…
          </p>
        )}
        {data && (
          <>
            <form onSubmit={saveOrigin}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="mcp-oauth-origin">Public HTTPS origin</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      key={data.origin}
                      id="mcp-oauth-origin"
                      name="origin"
                      type="url"
                      className="w-full sm:max-w-sm"
                      defaultValue={
                        data.origin ??
                        (window.location.protocol === 'https:' ? window.location.origin : '')
                      }
                      disabled={!canWrite || saving}
                      placeholder="https://plank.example.com"
                      required
                    />
                    {canWrite && (
                      <Button type="submit" variant="outline" disabled={saving}>
                        Save origin
                      </Button>
                    )}
                  </div>
                  <FieldDescription>
                    {data.origin
                      ? `MCP server URL: ${data.origin}/mcp`
                      : 'Save the public origin to enable OAuth discovery.'}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
            {canWrite && (
              <Button
                className="self-start"
                onClick={() => setEditor({ client: null })}
                disabled={!data.origin}
              >
                New OAuth client
              </Button>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Redirect URL</TableHead>
                  {(canWrite || canDelete) && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canWrite || canDelete ? 4 : 3}>
                      No OAuth clients yet.
                    </TableCell>
                  </TableRow>
                )}
                {data.clients.map((client) => (
                  <TableRow key={client.clientId}>
                    <TableCell>{client.name}</TableCell>
                    <TableCell>{client.clientId}</TableCell>
                    <TableCell>{client.redirectUri}</TableCell>
                    {(canWrite || canDelete) && (
                      <TableCell>
                        <div className="flex gap-2">
                          {canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditor({ client })}
                            >
                              Edit
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setRevoking(client)}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {editor && (
          <ClientDialog client={editor.client} close={() => setEditor(null)} refresh={refetch} />
        )}
        <Dialog
          open={Boolean(revoking)}
          onOpenChange={(open) => {
            if (!open && !saving) setRevoking(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke OAuth client</DialogTitle>
              <DialogDescription>
                Revoke {revoking?.name} and all of its OAuth authorizations.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevoking(null)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={revoke} disabled={saving}>
                Revoke client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
