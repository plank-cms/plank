import { useState, useRef } from 'react'
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
import { PlusIcon, Trash2Icon, CopyIcon, CheckIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner.tsx'
import { useAuth } from '@/context/auth.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Badge } from '@/components/ui/badge.tsx'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import HeaderFixed from '@/components/Header'

type ApiToken = {
  id: string
  name: string
  access_type: 'read-only' | 'full-access'
  created_at: string
}

type CreateForm = { name: string; accessType: 'read-only' | 'full-access' | '' }
type CreatedToken = { id: string; name: string; accessType: string; token: string }

const ACCESS_VARIANT: Record<string, 'default' | 'secondary'> = {
  'full-access': 'default',
  'read-only': 'secondary',
}

const ACCESS_LABEL: Record<string, string> = {
  'full-access': 'Full access',
  'read-only': 'Read only',
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={copy}>
      {copied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
    </Button>
  )
}

const EMPTY_FORM: CreateForm = { name: '', accessType: '' }

export function SettingsApiTokens() {
  const { user } = useAuth()
  const { data: tokens, loading, refetch } = useFetch<ApiToken[]>('/cms/admin/api-tokens')
  const { request, loading: submitting, error: apiError } = useApi<CreatedToken>()
  const permissions = user?.permissions ?? []
  const canWrite = permissions.includes('*') || permissions.includes('settings:api-tokens:write')
  const canDelete =
    permissions.includes('*') || permissions.includes('settings:api-tokens:delete')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [created, setCreated] = useState<CreatedToken | null>(null)

  const [deleteToken, setDeleteToken] = useState<ApiToken | null>(null)

  const columns: ColumnDef<ApiToken>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'access_type',
      header: 'Access',
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <Badge variant={ACCESS_VARIANT[v] ?? 'secondary'}>{ACCESS_LABEL[v] ?? v}</Badge>
      },
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
        canDelete ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteToken(row.original)}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        ) : null
      ),
    },
  ]

  const table = useReactTable({ data: tokens ?? [], columns, getCoreRowModel: getCoreRowModel() })

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    try {
      const result = await request('/cms/admin/api-tokens', 'POST', {
        name: form.name,
        accessType: form.accessType,
      })
      setCreated(result)
      refetch()
    } catch {
      /* shown via apiError */
    }
  }

  function handleCloseCreate() {
    setCreateOpen(false)
    setCreated(null)
    setForm(EMPTY_FORM)
  }

  async function handleDelete() {
    try {
      await request(`/cms/admin/api-tokens/${deleteToken!.id}`, 'DELETE')
      setDeleteToken(null)
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
            <h1 className="text-2xl font-bold -mt-2">API Tokens</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage tokens for consuming the public API.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!canWrite}>
            <PlusIcon className="size-4" />
            New token
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
                    No tokens yet.
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

        {/* Create dialog — two states: form / token revealed */}
        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            if (!o) handleCloseCreate()
          }}
        >
          <DialogContent className="sm:max-w-md">
            {!created ? (
              <>
                <DialogHeader>
                  <DialogTitle>New API token</DialogTitle>
                </DialogHeader>
                <form
                  id="create-token-form"
                  onSubmit={handleCreate}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="token-name">Name</Label>
                    <Input
                      id="token-name"
                      placeholder="e.g. Production frontend"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="token-access">Access type</Label>
                    <Select
                      value={form.accessType}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, accessType: v as CreateForm['accessType'] }))
                      }
                    >
                      <SelectTrigger id="token-access">
                        <SelectValue placeholder="Select access type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read-only">Read only</SelectItem>
                        <SelectItem value="full-access">Full access</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {apiError && <p className="text-sm text-destructive">{apiError}</p>}
                </form>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={handleCloseCreate}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="create-token-form"
                    disabled={submitting || !form.accessType || !canWrite}
                  >
                    {submitting ? 'Generating…' : 'Generate token'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Token generated</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Make sure to copy your token now. You won't be able to see it again.
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Token</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={created.token} className="font-mono text-xs" />
                      <CopyButton value={created.token} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCloseCreate}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog
          open={!!deleteToken}
          onOpenChange={(o) => {
            if (!o) setDeleteToken(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Revoke token</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to revoke{' '}
              <span className="font-medium text-foreground">{deleteToken?.name}</span>? Any frontend
              using it will immediately lose access.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteToken(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={submitting || !canDelete}>
                {submitting ? 'Revoking…' : 'Revoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </>
  )
}
