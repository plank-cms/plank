import { Button } from '@/shared/ui/button.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog.tsx'
import { Label } from '@/shared/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import { Columns3CogIcon } from 'lucide-react'
import type { ContentType, EntryFieldMap } from '../types.ts'

type DashboardEntryFieldsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionTypes: ContentType[]
  entryFieldMap: EntryFieldMap
  guessDefaultField: (ct: ContentType) => string
  setEntryFieldMap: (updater: (prev: EntryFieldMap) => EntryFieldMap) => void
}

export function DashboardEntryFieldsDialog({
  open,
  onOpenChange,
  collectionTypes,
  entryFieldMap,
  guessDefaultField,
  setEntryFieldMap,
}: DashboardEntryFieldsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button size="icon" variant="outline" onClick={() => onOpenChange(true)}>
        <Columns3CogIcon className="size-4" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dashboard entry fields</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {collectionTypes.map((ct) => (
            <div key={ct.slug} className="space-y-1.5">
              <Label htmlFor={`recent-field-${ct.slug}`}>{ct.name}</Label>
              <Select
                value={entryFieldMap[ct.slug] ?? guessDefaultField(ct)}
                onValueChange={(value) =>
                  setEntryFieldMap((prev) => ({ ...prev, [ct.slug]: value }))
                }
              >
                <SelectTrigger id={`recent-field-${ct.slug}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">id</SelectItem>
                  {ct.fields.map((field) => (
                    <SelectItem key={field.name} value={field.name}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
