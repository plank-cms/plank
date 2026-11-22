import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { useApi } from '@/shared/hooks/useApi.ts'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card.tsx'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'

const endpoint = '/cms/admin/mcp-oauth'

export function McpOAuthOriginSettings({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, refetch } = useFetch<{ origin: string | null }>(endpoint)
  const { request, loading: saving } = useApi()

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

  return (
    <Card className="mt-6 bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>MCP OAuth</CardTitle>
        <CardDescription>Set the public origin for personal OAuth connections.</CardDescription>
      </CardHeader>
      <CardContent>
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
                    <Button
                      type="submit"
                      variant="outline"
                      className="enabled:cursor-pointer motion-safe:enabled:active:scale-95"
                      disabled={saving}
                      aria-busy={saving}
                    >
                      {saving && <Spinner aria-hidden="true" />}
                      {saving ? 'Saving…' : 'Save origin'}
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
        )}
      </CardContent>
    </Card>
  )
}
