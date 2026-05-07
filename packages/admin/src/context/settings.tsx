import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from './auth.tsx'

interface SettingsContextValue {
  timezone: string
  locales: string[]
  defaultLocale: string
  editorialMode: boolean
  refreshSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue>({
  timezone: 'UTC',
  locales: ['en'],
  defaultLocale: 'en',
  editorialMode: false,
  refreshSettings: () => {},
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const [timezone, setTimezone] = useState('UTC')
  const [locales, setLocales] = useState<string[]>(['en'])
  const [defaultLocale, setDefaultLocale] = useState<string>('en')
  const [editorialMode, setEditorialMode] = useState(false)

  const fetchSettings = useCallback(() => {
    if (status !== 'authenticated') return

    // Editorial mode must be available to every authenticated role.
    fetch('/cms/admin/modes', {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((modes: { editorial?: boolean } | null) => {
        if (modes) setEditorialMode(Boolean(modes.editorial))
      })
      .catch(() => {})

    // Content editing needs these global settings for every authenticated role.
    fetch('/cms/admin/client-settings', {
      credentials: 'include',
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
        } catch {
          // Ignore legacy settings payload shape errors and keep defaults.
        }
        if (data?.default_locale) setDefaultLocale(data.default_locale)
      })
      .catch(() => {})
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') {
      setEditorialMode(false)
      return
    }
    fetchSettings()
  }, [status, fetchSettings])

  return (
    <SettingsContext.Provider
      value={{ timezone, locales, defaultLocale, editorialMode, refreshSettings: fetchSettings }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
