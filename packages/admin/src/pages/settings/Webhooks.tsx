import { useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
import { PlusIcon, Trash2Icon, WebhookIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import HeaderFixed from '@/components/Header'

type Webhook = {
  id: string
  name: string
  url: string
  events: string[]
  enabled: boolean
  created_at: string
}

type CreateForm = { name: string; url: string; events: string[] }

const ALL_EVENTS = [
  { value: 'entry.published', label: 'Entry published' },
  { value: 'entry.unpublished', label: 'Entry unpublished' },
  { value: 'entry.created', label: 'Entry created' },
  { value: 'entry.updated', label: 'Entry updated' },
  { value: 'entry.deleted', label: 'Entry deleted' },
]

const EMPTY_FORM: CreateForm = { name: '', url: '', events: [] }

export function SettingsWebhooks() {
  const { data: webhooks, loading, refetch } = useFetch<Webhook[]>('/cms/admin/webhooks')
  const { request, loading: submitting, error: apiError } = useApi<Webhook>()

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null)

  const columns: ColumnDef<Webhook>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'url',
      header: 'URL',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground truncate max-w-xs block">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'events',
      header: 'Events',
      cell: ({ getValue }) => (
        <div className="flex flex-wrap gap-1">
          {getValue<string[]>().map((e) => (
            <Badge key={e} variant="secondary" className="text-xs font-mono">
              {e}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ getValue }) =>
        new Date(getValue<string>()).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-destructive hover:text-destructive"
          onClick={() => setDeleteWebhook(row.original)}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      ),
    },
  ]

  const table = useReactTable({ data: webhooks ?? [], columns, getCoreRowModel: getCoreRowModel() })

  function toggleEvent(value: string) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(value)
        ? prev.events.filter((e) => e !== value)
        : [...prev.events, value],
    }))
  }

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    try {
      await request('/cms/admin/webhooks', 'POST', form)
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      refetch()
    } catch {
      /* shown via apiError */
    }
  }

  async function handleDelete() {
    try {
      await request(`/cms/admin/webhooks/${deleteWebhook!.id}`, 'DELETE')
      setDeleteWebhook(null)
      refetch()
    } catch {
      /* shown via apiError */
    }
  }

  return (
    <>
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold -mt-2">Webhooks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Notify external services when content events occur.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New webhook
          </Button>
        </div>
      </HeaderFixed>

      <section className="mt-24">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24">
                    <Spinner className="mx-auto size-5" />
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No webhooks yet.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            if (!o) {
              setCreateOpen(false)
              setForm(EMPTY_FORM)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New webhook</DialogTitle>
            </DialogHeader>
            <form id="create-webhook-form" onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="webhook-name">Name</Label>
                <Input
                  id="webhook-name"
                  placeholder="e.g. Dokploy deploy"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="webhook-url">URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://..."
                  value={form.url}
                  onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Events</Label>
                {ALL_EVENTS.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`event-${value}`}
                      checked={form.events.includes(value)}
                      onCheckedChange={() => toggleEvent(value)}
                    />
                    <label htmlFor={`event-${value}`} className="text-sm cursor-pointer">
                      {label}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{value}</span>
                    </label>
                  </div>
                ))}
              </div>
              {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            </form>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false)
                  setForm(EMPTY_FORM)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-webhook-form"
                disabled={submitting || form.events.length === 0}
              >
                {submitting ? 'Creating…' : 'Create webhook'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!deleteWebhook}
          onOpenChange={(o) => {
            if (!o) setDeleteWebhook(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete webhook</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deleteWebhook?.name}</span>? It will
              stop receiving events immediately.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteWebhook(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
                {submitting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </>
  )
}
