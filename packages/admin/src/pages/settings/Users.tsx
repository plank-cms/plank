import { useState, useMemo } from 'react'
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
import { PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useAuth } from '@/context/auth.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
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

type User = {
  id: string
  email: string
  role_id: string
  role_name?: string
  first_name: string | null
  last_name: string | null
  created_at: string
}

type Role = { id: string; name: string }

type CreateForm = { email: string; password: string; roleId: string }
type EditForm = { email: string; roleId: string; firstName: string; lastName: string }

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  'super admin': 'default',
  admin: 'secondary',
  user: 'outline',
}

function RoleBadge({ roleId, roleName, roles }: { roleId: string; roleName?: string; roles: Role[] }) {
  const role = roles.find((r) => r.id === roleId)
  const name = roleName ?? role?.name ?? roleId
  const variant = ROLE_VARIANT[name.toLowerCase()] ?? 'secondary'
  return <Badge variant={variant}>{name}</Badge>
}

function UserActions({
  user,
  currentUserId,
  currentUserRole,
  onEdit,
  onDelete,
}: {
  user: User
  currentUserId: string
  currentUserRole: string
  onEdit: (user: User) => void
  onDelete: (user: User) => void
}) {
  const isSelf = user.id === currentUserId
  const isSuperAdmin = (user.role_name ?? '').toLowerCase() === 'super admin'
  const currentIsSuperAdmin = currentUserRole.toLowerCase() === 'super admin'
  const disableEdit = isSuperAdmin && !isSelf && !currentIsSuperAdmin
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 disabled:opacity-30"
        disabled={disableEdit}
        onClick={() => onEdit(user)}
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-destructive hover:text-destructive disabled:opacity-30"
        disabled={isSelf || isSuperAdmin}
        onClick={() => onDelete(user)}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}

const EMPTY_CREATE: CreateForm = { email: '', password: '', roleId: '' }

export function SettingsUsers() {
  const { user: currentUser, updateUser } = useAuth()
  const { data: users, loading: loadingUsers, refetch } = useFetch<User[]>('/cms/admin/users')
  const { data: roles, loading: loadingRoles } = useFetch<Role[]>('/cms/admin/roles')
  const loading = loadingUsers || loadingRoles
  const { request, loading: submitting, error: apiError } = useApi()

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)

  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    email: '',
    roleId: '',
    firstName: '',
    lastName: '',
  })

  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  const roleList = roles ?? []
  const currentIsSuperAdmin = currentUser?.role?.toLowerCase() === 'super admin'
  const assignableRoles = currentIsSuperAdmin
    ? roleList
    : roleList.filter((r) => r.name.toLowerCase() !== 'super admin')

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const { first_name, last_name } = row.original
          if (!first_name && !last_name) return <span className="text-muted-foreground">—</span>
          return (
            <span className="font-bold">{[first_name, last_name].filter(Boolean).join(' ')}</span>
          )
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
      },
      {
        accessorKey: 'role_id',
        header: 'Role',
        cell: ({ row, getValue }) => (
          <RoleBadge
            roleId={getValue<string>()}
            roleName={row.original.role_name}
            roles={roleList}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <UserActions
            user={row.original}
            currentUserId={currentUser?.id ?? ''}
            currentUserRole={currentUser?.role ?? ''}
            onEdit={(u) => {
              setEditUser(u)
              setEditForm({
                email: u.email,
                roleId: u.role_id,
                firstName: u.first_name ?? '',
                lastName: u.last_name ?? '',
              })
            }}
            onDelete={setDeleteUser}
          />
        ),
      },
    ],
    [roleList, currentUser?.id, currentUser?.role],
  )

  const sortedUsers = useMemo(() => {
    return [...(users ?? [])].sort((a, b) => {
      const nameA = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email
      const nameB = [b.first_name, b.last_name].filter(Boolean).join(' ') || b.email
      return nameA.localeCompare(nameB)
    })
  }, [users])

  const table = useReactTable({ data: sortedUsers, columns, getCoreRowModel: getCoreRowModel() })

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    try {
      await request('/cms/admin/users', 'POST', createForm)
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE)
      refetch()
    } catch {
      /* error shown via apiError */
    }
  }

  async function handleEdit(e: React.SyntheticEvent) {
    e.preventDefault()
    try {
      await request(`/cms/admin/users/${editUser!.id}`, 'PUT', editForm)
      if (editUser!.id === currentUser?.id) {
        updateUser({
          email: editForm.email,
          firstName: editForm.firstName || null,
          lastName: editForm.lastName || null,
        })
      }
      setEditUser(null)
      refetch()
    } catch {
      /* error shown via apiError */
    }
  }

  async function handleDelete() {
    try {
      await request(`/cms/admin/users/${deleteUser!.id}`, 'DELETE')
      setDeleteUser(null)
      refetch()
    } catch {
      /* error shown via apiError */
    }
  }

  return (
    <>
      <HeaderFixed>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold -mt-2">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage who has access to the admin panel.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New user
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
                    No users found.
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

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
            </DialogHeader>
            <form id="create-user-form" onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="user@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-password">Password</Label>
                <Input
                  id="c-password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-role">Role</Label>
                <Select
                  value={createForm.roleId}
                  onValueChange={(v) => setCreateForm((p) => ({ ...p, roleId: v }))}
                >
                  <SelectTrigger id="c-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            </form>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-user-form" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create user'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit dialog */}
        <Dialog
          open={!!editUser}
          onOpenChange={(o) => {
            if (!o) setEditUser(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
            </DialogHeader>
            <form id="edit-user-form" onSubmit={handleEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-email">Email</Label>
                <Input
                  id="e-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-fname">First name</Label>
                <Input
                  id="e-fname"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-lname">Last name</Label>
                <Input
                  id="e-lname"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-role">Role</Label>
                <Select
                  value={editForm.roleId}
                  onValueChange={(v) => setEditForm((p) => ({ ...p, roleId: v }))}
                >
                  <SelectTrigger id="e-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            </form>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-user-form" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog
          open={!!deleteUser}
          onOpenChange={(o) => {
            if (!o) setDeleteUser(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete user</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deleteUser?.email}</span>? This action
              cannot be undone.
            </p>
            {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteUser(null)}>
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
