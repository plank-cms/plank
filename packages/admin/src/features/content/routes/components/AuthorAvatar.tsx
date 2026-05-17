import { UserAvatar } from '@/shared/ui/custom/UserAvatar.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip.tsx'
import type { Entry } from '../types.ts'

export function AuthorAvatar({ entry }: { entry: Entry }) {
  const first = entry._author_first_name
  const last = entry._author_last_name
  const label = first || last ? [first, last].filter(Boolean).join(' ') : null

  const avatar = (
    <UserAvatar
      avatarUrl={entry._author_avatar_url}
      firstName={first}
      lastName={last}
      className="size-7"
      fallbackClassName="text-[10px]"
    />
  )

  if (!label) return avatar

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
