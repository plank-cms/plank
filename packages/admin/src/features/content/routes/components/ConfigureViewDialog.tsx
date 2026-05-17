import { useEffect, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from 'lucide-react'
import { Button } from '@/shared/ui/button.tsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import {
  humanize,
  SYSTEM_COL_DEFS,
  SYSTEM_SORT_OPTIONS,
} from '../lib/entriesList.ts'
import type { ColSort, FieldDef, ViewConfig } from '../types.ts'
import { RelationFieldSelector } from './RelationFieldSelector.tsx'

type ConfigureViewDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  allFields: FieldDef[]
  config: ViewConfig
  onApply: (cfg: ViewConfig) => void
}

export function ConfigureViewDialog({
  open,
  onOpenChange,
  allFields,
  config,
  onApply,
}: ConfigureViewDialogProps) {
  const [visible, setVisible] = useState<string[]>(config.visibleFields)
  const [visibleSysCols, setVisibleSysCols] = useState<string[]>(config.visibleSystemCols)
  const [sort, setSort] = useState<ColSort>(config.sort)

  useEffect(() => {
    if (open) {
      setVisible(config.visibleFields)
      setVisibleSysCols(config.visibleSystemCols)
      setSort(config.sort)
    }
  }, [open, config])

  const hidden = allFields.filter((f) => !visible.some((v) => v.split('.')[0] === f.name))

  function move(name: string, dir: -1 | 1) {
    setVisible((prev) => {
      const idx = prev.indexOf(name)
      if (idx === -1) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function add(name: string) {
    setVisible((prev) => [...prev, name])
  }

  function remove(name: string) {
    setVisible((prev) => prev.filter((n) => n !== name))
  }

  const sortOptions = [
    ...SYSTEM_SORT_OPTIONS,
    ...allFields
      .filter((f) => !['media', 'text', 'richtext', 'relation'].includes(f.type))
      .map((f) => ({ name: f.name, label: humanize(f.name) })),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md flex flex-col">
        <DialogHeader className="flex-none">
          <DialogTitle>Configure the view</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 py-1">
          <div
            className={
              hidden.length > 0 || visibleSysCols.length < SYSTEM_COL_DEFS.length
                ? 'flex-1 min-h-0 grid gap-5 [grid-template-rows:minmax(7rem,1fr)_minmax(7rem,1fr)]'
                : 'flex min-h-0 flex-1 flex-col'
            }
          >
            <div className="flex min-h-0 flex-col">
              <p className="mb-2 flex-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Displayed fields
              </p>
              {visible.length === 0 && visibleSysCols.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No fields selected.</p>
              ) : (
                <ul className="flex-1 min-h-0 space-y-1 overflow-y-auto">
                  {visible.map((name, idx) => {
                    const base = String(name).split('.')[0]
                    const field = allFields.find((f) => f.name === base)
                    return (
                      <li
                        key={name}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="flex-1 font-medium">{humanize(base)}</span>
                        {field && <span className="text-xs text-muted-foreground">{field.type}</span>}
                        {field && field.type === 'relation' && (
                          <div className="ml-2">
                            <RelationFieldSelector
                              allFields={allFields}
                              fieldName={name}
                              visible={visible}
                              setVisible={setVisible}
                            />
                          </div>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => move(name, -1)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={idx === visible.length - 1}
                          onClick={() => move(name, 1)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(name)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <MinusCircleIcon className="size-3.5" />
                        </Button>
                      </li>
                    )
                  })}
                  {visibleSysCols.map((name) => {
                    const col = SYSTEM_COL_DEFS.find((c) => c.name === name)
                    if (!col) return null
                    return (
                      <li
                        key={name}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="flex-1 font-medium">{col.label}</span>
                        <span className="text-xs text-muted-foreground">system</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled
                          className="flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled
                          className="flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setVisibleSysCols((prev) => prev.filter((n) => n !== name))}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <MinusCircleIcon className="size-3.5" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {(hidden.length > 0 || visibleSysCols.length < SYSTEM_COL_DEFS.length) && (
              <div className="flex min-h-0 flex-col">
                <p className="mb-2 flex-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Available fields
                </p>
                <ul className="flex-1 min-h-0 space-y-1 overflow-y-auto">
                  {hidden.map((field) => (
                    <li
                      key={field.name}
                      className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                    >
                      <span className="flex-1">{humanize(field.name)}</span>
                      <span className="text-xs">{field.type}</span>
                      <button
                        type="button"
                        onClick={() => add(field.name)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <PlusCircleIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {SYSTEM_COL_DEFS.filter((c) => !visibleSysCols.includes(c.name)).map((col) => (
                    <li
                      key={col.name}
                      className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                    >
                      <span className="flex-1">{col.label}</span>
                      <span className="text-xs">system</span>
                      <button
                        type="button"
                        onClick={() => setVisibleSysCols((prev) => [...prev, col.name])}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <PlusCircleIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex-none">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sort entries
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={sort.field}
                onValueChange={(v) => setSort((s) => ({ ...s, field: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort.dir}
                onValueChange={(v) => setSort((s) => ({ ...s, dir: v as 'asc' | 'desc' }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-none">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply({ visibleFields: visible, visibleSystemCols: visibleSysCols, sort })
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
