import { useState } from 'react'
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

type Connection = { clientId: string; name: string }
type ConnectionInfo = { serverUrl: string | null; connections: Connection[] }
const endpoint = '/cms/admin/users/me/mcp-connections'

export function PersonalMcpConnections() {
  const { data, loading, error, refetch } = useFetch<ConnectionInfo>(endpoint)
  const { request, loading: revoking } = useApi()
  const [selected, setSelected] = useState<Connection | null>(null)

  async function disconnect() {
    if (!selected) return
    try {
      await request(`${endpoint}/${encodeURIComponent(selected.clientId)}`, 'DELETE')
      setSelected(null)
      refetch()
      toast.success('OAuth connection revoked')
    } catch {
      toast.error('Could not revoke OAuth connection')
    }
  }

  return (
    <Card className="mt-6 bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>My MCP OAuth connections</CardTitle>
        <CardDescription>
          Start the connection in your MCP client and approve it with your Plank account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading connections…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Could not load connections.
          </p>
        )}
        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              {data.serverUrl ? (
                <>
                  MCP server URL: <code>{data.serverUrl}</code>
                </>
              ) : (
                'MCP OAuth is not configured for this instance.'
              )}
            </p>
            {data.connections.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {data.connections.map((connection) => (
                  <li
                    key={connection.clientId}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span>{connection.name}</span>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSelected(connection)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No active OAuth connections.</p>
            )}
          </>
        )}
      </CardContent>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !revoking) setSelected(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke connection</DialogTitle>
            <DialogDescription>
              Revoke your Plank account’s authorization for {selected?.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={revoking} onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={revoking} onClick={disconnect}>
              {revoking ? 'Revoking…' : 'Revoke connection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
