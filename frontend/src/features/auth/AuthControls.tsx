import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { startGoogleSignIn } from '../../api/auth'
import { useAuth } from './authContext'
import './AuthControls.css'

function AuthControls() {
  const { state, signingOut, signOut, retry } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)
  const noteId = useId()
  const actionFocus = useRef(false)
  const signInButton = useRef<HTMLButtonElement>(null)
  const signOutButton = useRef<HTMLButtonElement>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  const displayName = state.status === 'authenticated' ? state.user.display_name?.trim() || state.user.email : ''
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase()

  // Escape must dismiss a pointer-opened hint even when focus is elsewhere.
  useEffect(() => {
    const dismissHint = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHintDismissed(true)
    }
    window.addEventListener('keydown', dismissHint)
    return () => window.removeEventListener('keydown', dismissHint)
  }, [])

  // Finish focus handling during commit so an older passive effect cannot
  // consume the focus request from a newly clicked retry/sign-out action.
  useLayoutEffect(() => {
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
    <section className={`auth-controls${state.status === 'authenticated' ? ' auth-controls--authenticated' : ''}${hintDismissed ? ' auth-controls--hint-dismissed' : ''}`} aria-label="Account" aria-busy={state.status === 'loading' || signingOut || leaving} onMouseEnter={() => setHintDismissed(false)}>
      {state.status === 'loading' && <p role="status">Checking sign-in…</p>}
      {state.status === 'authenticated' && <>
        <div className="auth-profile">
          <span className="auth-avatar" aria-hidden="true">{initials}</span>
          <p role="status" className="auth-identity" title={displayName}>
            <span className="auth-sr-only">Signed in as </span><strong>{displayName}</strong>
          </p>
        </div>
        <div className="auth-actions">
          <button ref={signOutButton} className="auth-sign-out" type="button" onClick={requestSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </>}
      {state.status === 'error' && <>
        <p role="alert" className="auth-feedback">{state.message}</p>
        <button ref={retryButton} type="button" aria-label="Retry sign-in check" onClick={retryCheck}>Retry</button>
      </>}
      {state.status === 'unauthenticated' && state.notice && <p role="status" className="auth-sr-only">{state.notice}</p>}
      {(state.status === 'unauthenticated' || state.status === 'error') && <>
        <button ref={signInButton} className="auth-sign-in" type="button" onFocus={() => setHintDismissed(false)} onClick={signIn} disabled={leaving} aria-describedby={noteId}>
          {leaving ? 'Opening sign-in…' : 'Sign in with Google'}
        </button>
        <p className="auth-help" id={noteId}>Signing in leaves this page and clears unsaved trip details.</p>
      </>}
      {navigationError && <p role="alert" className="auth-feedback">{navigationError}</p>}
    </section>
  )
}

export default AuthControls
