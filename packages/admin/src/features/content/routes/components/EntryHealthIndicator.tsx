import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip.tsx'

export function EntryHealthIndicator({
  hasIssues,
  title,
}: {
  hasIssues: boolean
  title: string
}) {
  const variant = hasIssues
    ? {
        border: 'border-amber-500/40',
        dots: ['bg-amber-400', 'bg-amber-400'],
      }
    : {
        border: 'border-emerald-500/40',
        dots: ['bg-emerald-500', 'bg-emerald-500'],
      }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-6 w-4 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border ${variant.border}`}
        >
          {variant.dots.map((dotClassName, index) => (
            <span key={index} className={`block size-1.5 rounded-full ${dotClassName}`} />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
