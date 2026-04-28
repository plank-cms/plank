import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface SettingsContextValue {
  timezone: string
  locales: string[]
  defaultLocale: string
  refreshSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue>({
  timezone: 'UTC',
  locales: ['en'],
  defaultLocale: 'en',
  refreshSettings: () => {},
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezone] = useState('UTC')
  const [locales, setLocales] = useState<string[]>(['en'])
  const [defaultLocale, setDefaultLocale] = useState<string>('en')

  const fetchSettings = useCallback(() => {
    const token = localStorage.getItem('plank_token')
    if (!token) return

    fetch('/cms/admin/settings/general', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, string> | null) => {
        if (data?.timezone) setTimezone(data.timezone)
        try {
          if (data?.locales) {
            // support JSON array or comma-separated
            let parsed: string[] = []
            try {
              parsed = JSON.parse(data.locales)
            } catch {
              parsed = (data.locales || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            }
            if (parsed.length) setLocales(parsed)
          }
        } catch {}
        if (data?.default_locale) setDefaultLocale(data.default_locale)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return (
    <SettingsContext.Provider
      value={{ timezone, locales, defaultLocale, refreshSettings: fetchSettings }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
