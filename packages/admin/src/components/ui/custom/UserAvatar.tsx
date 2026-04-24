import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar.tsx'
import { cn } from '@/lib/utils.ts'

interface UserAvatarProps {
  avatarUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  className?: string
  fallbackClassName?: string
}

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

export function UserAvatar({ avatarUrl, firstName, lastName, email, className, fallbackClassName }: UserAvatarProps) {
  return (
    <Avatar key={avatarUrl ?? 'fallback'} className={cn('size-8', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" className="object-cover" />}
      <AvatarFallback className={cn('text-[11px]', fallbackClassName)}>
        {getInitials(firstName, lastName, email)}
      </AvatarFallback>
    </Avatar>
  )
}
