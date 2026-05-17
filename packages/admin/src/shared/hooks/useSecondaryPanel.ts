import { useEffect, type ReactNode } from 'react'
import { useSecondaryPanelContext } from '@/shared/context/secondaryPanel.tsx'

export function useSecondaryPanel(content: ReactNode) {
  const { setContent } = useSecondaryPanelContext()
  useEffect(() => {
    setContent(content)
    return () => setContent(null)
  }, [])
}
