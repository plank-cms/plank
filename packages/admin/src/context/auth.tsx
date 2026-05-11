import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'

interface User {
  id: string
  email: string
  role: string
  permissions: string[]
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  jobTitle: string | null
  organization: string | null
  country: string | null
  twoFactorEnabled: boolean
  enabled?: boolean
  modes?: {
    editorial: boolean
  }
}

interface AuthState {
  user: User | null
  status: 'idle' | 'authenticated' | 'unauthenticated'
}

type AuthAction =
  | { type: 'LOGIN'; payload: { user: User } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> }

interface AuthContextValue extends AuthState {
  login: (user: User) => void
  logout: () => void
  updateUser: (patch: Partial<User>) => void
}

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return { user: action.payload.user, status: 'authenticated' }
    case 'LOGOUT':
      return { user: null, status: 'unauthenticated' }
    case 'UPDATE_USER':
      return { ...state, user: state.user ? { ...state.user, ...action.payload } : null }
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    user: null,
    status: 'idle',
  })

  useEffect(() => {
    fetch('/cms/admin/users/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: {
        id: string
        email: string
        role?: string
        role_name?: string
        role_id?: string
        first_name?: string | null
        last_name?: string | null
        avatar_url?: string | null
        job_title?: string | null
        organization?: string | null
        country?: string | null
        permissions?: string[]
        two_factor_enabled?: boolean
        enabled?: boolean
        modes?: {
          editorial?: boolean
        }
      } | null) => {
        if (!data) {
          dispatch({ type: 'LOGOUT' })
          return
        }
        dispatch({
          type: 'LOGIN',
          payload: {
            user: {
              id: data.id,
              email: data.email,
              role: data.role ?? data.role_name ?? 'unknown',
              permissions: data.permissions ?? [],
              firstName: data.first_name ?? null,
              lastName: data.last_name ?? null,
              avatarUrl: data.avatar_url ?? null,
              jobTitle: data.job_title ?? null,
              organization: data.organization ?? null,
              country: data.country ?? null,
              twoFactorEnabled: data.two_factor_enabled ?? false,
              enabled: data.enabled ?? true,
              modes: {
                editorial: Boolean(data.modes?.editorial),
              },
            },
          },
        })
      })
      .catch(() => dispatch({ type: 'LOGOUT' }))
  }, [])

  function login(user: User) {
    dispatch({ type: 'LOGIN', payload: { user } })
  }

  function logout() {
    fetch('/cms/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    dispatch({ type: 'LOGOUT' })
  }

  function updateUser(patch: Partial<User>) {
    dispatch({ type: 'UPDATE_USER', payload: patch })
  }

  return <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
