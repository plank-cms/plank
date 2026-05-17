import { useState, useEffect, useCallback } from 'react'

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useFetch<T>(url: string | null, options?: RequestInit) {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: Boolean(url), error: null })

  const run = useCallback(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null })
      return
    }

    setState({ data: null, loading: true, error: null })

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    }

    fetch(url, { ...options, credentials: 'include', headers })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<T>
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setState({ data: null, loading: false, error: message })
      })
  }, [url, options])

  useEffect(() => {
    run()
  }, [run])

  return { ...state, refetch: run }
}
