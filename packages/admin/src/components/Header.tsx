import { useSecondaryPanelContext } from '@/context/secondaryPanel.tsx'

export default function HeaderFixed({ children }: { children: React.ReactNode }) {
  const { content: secondaryPanel } = useSecondaryPanelContext()

  return (
    <div
      className={`bg-background fixed top-0 z-50 px-4 pt-4 h-18 left-14 ${secondaryPanel ? 'right-64' : 'right-0'}`}
    >
      {children}
    </div>
  )
}
