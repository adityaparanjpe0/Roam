import { createContext, useContext } from 'react'
import type { AuthUser } from '../../api/auth'

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated'; notice?: string }
  | { status: 'error'; message: string }

interface AuthContextValue {
  state: AuthState
  signingOut: boolean
  retry: () => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('AuthProvider is required')
  return context
}
