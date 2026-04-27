import clsx from 'clsx'

export default function HeaderFixed({
  children,
  sidebar = false,
}: {
  children: React.ReactNode
  sidebar?: boolean
}) {
  return (
    <div
      className={clsx(
        'bg-background fixed top-0 w-full z-50 pt-4 h-18',
        sidebar ? 'max-w-[52.1rem] xl:max-w-274 2xl:max-w-312' : 'max-w-312',
      )}
    >
      {children}
    </div>
  )
}
