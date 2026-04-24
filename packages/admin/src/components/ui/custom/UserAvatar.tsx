import { forwardRef } from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar.tsx'
import { cn } from '@/lib/utils.ts'

type UserAvatarProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
  avatarUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  fallbackClassName?: string
}

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

export const UserAvatar = forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, UserAvatarProps>(
  ({ avatarUrl, firstName, lastName, email, className, fallbackClassName, ...rest }, ref) => (
    <Avatar key={avatarUrl ?? 'fallback'} ref={ref} className={cn('size-8', className)} {...rest}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" className="object-cover" />}
      <AvatarFallback className={cn('text-[11px]', fallbackClassName)}>
        {getInitials(firstName, lastName, email)}
      </AvatarFallback>
    </Avatar>
  )
)
UserAvatar.displayName = 'UserAvatar'
