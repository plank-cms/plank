import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface SettingsContextValue {
  timezone: string
  refreshSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue>({
  timezone: 'UTC',
  refreshSettings: () => {},
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezone] = useState('UTC')

  const fetchSettings = useCallback(() => {
    const token = localStorage.getItem('plank_token')
    if (!token) return

    fetch('/cms/admin/settings/general', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, string> | null) => {
        if (data?.timezone) setTimezone(data.timezone)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return (
    <SettingsContext.Provider value={{ timezone, refreshSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
