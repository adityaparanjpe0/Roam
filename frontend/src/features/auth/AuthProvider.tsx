import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthError, getCurrentUser, logout } from '../../api/auth'
import { AuthContext } from './authContext'
import type { AuthState } from './authContext'

function failureMessage(error: unknown, signingOut: boolean): string {
  if (error instanceof AuthError && error.code === 'CSRF_FAILED') {
    return 'Request verification failed. Sign in again to restore your account controls.'
  }
  if (signingOut) return 'Could not confirm sign out. Check your session before trying again.'
  if (error instanceof AuthError && error.code === 'TIMEOUT') return 'The sign-in check timed out. Try again.'
  return 'Could not check your sign-in status. Your session may still be active. Try again.'
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [signingOut, setSigningOut] = useState(false)
  const request = useRef<AbortController | null>(null)
  const revision = useRef(0)
  const logoutPending = useRef(false)
  const hadSession = useRef(false)

  const check = useCallback(() => {
    if (logoutPending.current || request.current !== null) return
    const controller = new AbortController()
    request.current = controller
    const current = ++revision.current
    void getCurrentUser(controller.signal).then((user) => {
      if (controller.signal.aborted || current !== revision.current) return
      if (user !== null) {
        hadSession.current = true
        setState({ status: 'authenticated', user })
      } else {
        const ended = hadSession.current
        hadSession.current = false
        setState((previous) => ({
          status: 'unauthenticated',
          notice: ended ? 'Your session ended. Sign in again.' : previous.status === 'unauthenticated' ? previous.notice : undefined,
        }))
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && current === revision.current) {
        setState({ status: 'error', message: failureMessage(error, false) })
      }
    }).finally(() => {
      if (request.current === controller) request.current = null
    })
  }, [])

  useEffect(() => {
    void check()
    const recover = () => { if (document.visibilityState !== 'hidden') void check() }
    window.addEventListener('focus', recover)
    window.addEventListener('online', recover)
    document.addEventListener('visibilitychange', recover)
    return () => {
      window.removeEventListener('focus', recover)
      window.removeEventListener('online', recover)
      document.removeEventListener('visibilitychange', recover)
      revision.current += 1
      request.current?.abort()
      request.current = null
    }
  }, [check])

  function retry() {
    if (logoutPending.current || request.current !== null) return
    setState({ status: 'loading' })
    void check()
  }

  async function signOut() {
    if (logoutPending.current) return
    logoutPending.current = true
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const current = ++revision.current
    setSigningOut(true)
    try {
      const result = await logout(controller.signal)
      if (controller.signal.aborted || current !== revision.current) return
      hadSession.current = false
      setState({ status: 'unauthenticated', notice: result === 'signed-out' ? 'Signed out.' : 'Your session ended. You are signed out.' })
    } catch (error) {
      if (!controller.signal.aborted && current === revision.current) {
        if (error instanceof AuthError && error.code === 'CSRF_FAILED') {
          // Absolute cookie expiry can remove CSRF before logout is sent.
          // Confirm absence with the backend; a missing cookie alone is not proof.
          try {
            const user = await getCurrentUser(controller.signal)
            if (controller.signal.aborted || current !== revision.current) return
            if (user === null) {
              hadSession.current = false
              setState({ status: 'unauthenticated', notice: 'Your session ended. You are signed out.' })
              return
            }
          } catch {
            if (!controller.signal.aborted && current === revision.current) {
              setState({ status: 'error', message: 'Could not confirm sign out. Check your session before trying again.' })
            }
            return
          }
        }
        setState({ status: 'error', message: failureMessage(error, true) })
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        logoutPending.current = false
        setSigningOut(false)
      }
    }
  }

  return (
    <AuthContext value={{ state, signingOut, retry, signOut: () => { void signOut() } }}>
      {children}
    </AuthContext>
  )
}

export default AuthProvider
