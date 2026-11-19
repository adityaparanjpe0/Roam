import { useEffect, useId, useRef, useState } from 'react'
import { startGoogleSignIn } from '../../api/auth'
import { useAuth } from './authContext'
import './AuthControls.css'

function AuthControls() {
  const { state, signingOut, signOut, retry } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const noteId = useId()
  const actionFocus = useRef(false)
  const signInButton = useRef<HTMLButtonElement>(null)
  const signOutButton = useRef<HTMLButtonElement>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  const displayName = state.status === 'authenticated' ? state.user.display_name?.trim() || state.user.email : ''
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase()

  useEffect(() => {
    if (!actionFocus.current || signingOut || state.status === 'loading') return
    actionFocus.current = false
    const target = state.status === 'error' ? retryButton : state.status === 'authenticated' ? signOutButton : signInButton
    target.current?.focus()
  }, [state.status, signingOut])

  function retryCheck() { actionFocus.current = true; retry() }
  function requestSignOut() { actionFocus.current = true; signOut() }

  function signIn() {
    if (leaving) return
    setLeaving(true)
    setNavigationError(null)
    try { startGoogleSignIn() } catch {
      setLeaving(false)
      setNavigationError('Could not open sign-in. Try again.')
    }
  }

  return (
    <section className={`auth-controls${state.status === 'authenticated' ? ' auth-controls--authenticated' : ''}`} aria-label="Account" aria-busy={state.status === 'loading' || signingOut || leaving}>
      {state.status === 'loading' && <p role="status">Checking sign-in…</p>}
      {state.status === 'authenticated' && <>
        <div className="auth-profile">
          <span className="auth-avatar" aria-hidden="true">{initials}</span>
          <p role="status" className="auth-identity" title={displayName}>
            <span className="auth-sr-only">Signed in as </span><strong>{displayName}</strong>
          </p>
        </div>
        <div className="auth-actions">
          <button className="auth-refresh" type="button" aria-label="Check session" title="Check session" onClick={retryCheck} disabled={signingOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
            </svg>
          </button>
          <button ref={signOutButton} className="auth-sign-out" type="button" onClick={requestSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </>}
      {state.status === 'error' && <>
        <p role="alert">{state.message}</p>
        <button ref={retryButton} type="button" onClick={retryCheck}>Retry sign-in check</button>
      </>}
      {state.status === 'unauthenticated' && state.notice && <p role="status">{state.notice}</p>}
      {(state.status === 'unauthenticated' || state.status === 'error') && <>
        <button ref={signInButton} className="auth-sign-in" type="button" onClick={signIn} disabled={leaving} aria-describedby={noteId}>
          {leaving ? 'Opening sign-in…' : 'Sign in with Google'}
        </button>
        <p className="auth-help" id={noteId}>Signing in leaves this page and clears unsaved trip details.</p>
      </>}
      {navigationError && <p role="alert">{navigationError}</p>}
    </section>
  )
}

export default AuthControls
