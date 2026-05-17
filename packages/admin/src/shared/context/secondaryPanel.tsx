import { createContext, useContext, useState, type ReactNode } from 'react'

type SecondaryPanelContextType = {
  content: ReactNode
  setContent: (content: ReactNode) => void
}

const SecondaryPanelContext = createContext<SecondaryPanelContextType | null>(null)

export function SecondaryPanelProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null)
  return (
    <SecondaryPanelContext.Provider value={{ content, setContent }}>
      {children}
    </SecondaryPanelContext.Provider>
  )
}

export function useSecondaryPanelContext() {
  const ctx = useContext(SecondaryPanelContext)
  if (!ctx) throw new Error('useSecondaryPanelContext must be used within SecondaryPanelProvider')
  return ctx
}
