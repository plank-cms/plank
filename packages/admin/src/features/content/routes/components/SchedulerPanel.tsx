import { format } from 'date-fns'
import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button.tsx'
import { Calendar } from '@/shared/ui/calendar.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'

type SchedulerPanelProps = {
  visible: boolean
  readOnly: boolean
  calOpen: boolean
  onCalOpenChange: (open: boolean) => void
  schedDate: Date | undefined
  onSchedDateChange: (date: Date | undefined) => void
  schedTime: string
  onSchedTimeChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  canSchedule: boolean
  busy: boolean
}

export function SchedulerPanel({
  visible,
  readOnly,
  calOpen,
  onCalOpenChange,
  schedDate,
  onSchedDateChange,
  schedTime,
  onSchedTimeChange,
  onConfirm,
  onCancel,
  canSchedule,
  busy,
}: SchedulerPanelProps) {
  if (!visible || readOnly) return null

  return (
    <div className="mb-6 flex items-end gap-2 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label>Date</Label>
        <Popover open={calOpen} onOpenChange={onCalOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-40 justify-between font-normal">
              {schedDate ? format(schedDate, 'MMM d, yyyy') : 'Select date'}
              <ChevronDownIcon className="size-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={schedDate}
              captionLayout="dropdown"
              defaultMonth={schedDate ?? new Date()}
              disabled={{ before: new Date() }}
              onSelect={(date) => {
                onSchedDateChange(date)
                onCalOpenChange(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-1.5">
        <Label>
          Time <span className="font-normal text-muted-foreground">(24h)</span>
        </Label>
        <Input
          type="time"
          className="w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          value={schedTime}
          onChange={(e) => onSchedTimeChange(e.target.value)}
        />
      </div>
      <Button onClick={onConfirm} disabled={!canSchedule || busy}>
        {busy ? <Spinner className="size-4" /> : null}
        Confirm
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
