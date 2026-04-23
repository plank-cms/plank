import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'

interface User {
  id: string
  email: string
  role: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
}

interface AuthState {
  user: User | null
  token: string | null
  status: 'idle' | 'authenticated' | 'unauthenticated'
}

type AuthAction =
  | { type: 'LOGIN'; payload: { user: User; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> }

interface AuthContextValue extends AuthState {
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (patch: Partial<User>) => void
}

const TOKEN_KEY = 'plank_token'
const USER_KEY = 'plank_user'

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return { user: action.payload.user, token: action.payload.token, status: 'authenticated' }
    case 'LOGOUT':
      return { user: null, token: null, status: 'unauthenticated' }
    case 'UPDATE_USER':
      return { ...state, user: state.user ? { ...state.user, ...action.payload } : null }
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    user: null,
    token: null,
    status: 'idle',
  })

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(USER_KEY)
    if (token && raw) {
      try {
        const user = JSON.parse(raw) as User
        dispatch({ type: 'LOGIN', payload: { user, token } })
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        dispatch({ type: 'LOGOUT' })
      }
    } else {
      dispatch({ type: 'LOGOUT' })
    }
  }, [])

  function login(user: User, token: string) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    dispatch({ type: 'LOGIN', payload: { user, token } })
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    dispatch({ type: 'LOGOUT' })
  }

  function updateUser(patch: Partial<User>) {
    dispatch({ type: 'UPDATE_USER', payload: patch })
    const raw = localStorage.getItem(USER_KEY)
    if (raw) {
      try {
        const user = JSON.parse(raw) as User
        localStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...patch }))
      } catch { /* ignore */ }
    }
  }

  return <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
