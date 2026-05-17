import { EllipsisIcon, FolderIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Checkbox } from '@/shared/ui/checkbox.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu.tsx'
import { handleCardKeyboard } from '../lib/media.ts'
import type { Folder } from '../types.ts'

type FolderCardProps = {
  folder: Folder
  onOpen: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onRename: (folder: Folder) => void
  canDelete: boolean
  canRename: boolean
  selected: boolean
  onToggle: (id: string) => void
}

export function FolderCard({
  folder,
  onOpen,
  onDelete,
  onRename,
  canDelete,
  canRename,
  selected,
  onToggle,
}: FolderCardProps) {
  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50 ${selected ? 'ring-2 ring-primary' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => {
        if (!selected) onOpen(folder)
      }}
      onKeyDown={(event) => {
        handleCardKeyboard(event, () => {
          if (!selected) onOpen(folder)
        })
      }}
    >
      <div className="relative flex size-7 shrink-0 items-center justify-center">
        <FolderIcon
          className={`size-7 text-muted-foreground transition-opacity ${selected ? 'opacity-0' : 'group-hover:opacity-0'}`}
        />
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(`folder:${folder.id}`)}
            aria-label="Select folder"
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold" title={folder.name}>
          {folder.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {folder.item_count} {folder.item_count === 1 ? 'item' : 'items'}
        </p>
      </div>
      {!selected && (canRename || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canRename && (
              <DropdownMenuItem onSelect={() => onRename(folder)}>
                <PencilIcon className="size-4" />
                Rename
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                onSelect={() => onDelete(folder)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
