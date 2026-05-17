import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type ShortcutMeta = {
  combo: string
  label: string
}

type KeyboardShortcutsContextValue = {
  shortcuts: ShortcutMeta[]
  register: (combo: string, label: string) => () => void
}

export const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
  shortcuts: [],
  register: () => () => {},
})

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutMeta[]>([])

  const register = useCallback((combo: string, label: string) => {
    const entry: ShortcutMeta = { combo, label }
    setShortcuts((prev) => [...prev, entry])
    return () => setShortcuts((prev) => prev.filter((s) => s !== entry))
  }, [])

  return (
    <KeyboardShortcutsContext.Provider value={{ shortcuts, register }}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useShortcutsRegistry() {
  return useContext(KeyboardShortcutsContext)
}
