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
    <section className="auth-controls" aria-label="Account" aria-busy={state.status === 'loading' || signingOut || leaving}>
      {state.status === 'loading' && <p role="status">Checking sign-in…</p>}
      {state.status === 'authenticated' && <>
        <p role="status" className="auth-identity">Signed in as <strong>{state.user.display_name?.trim() || state.user.email}</strong></p>
        <div className="auth-actions">
          <button ref={signOutButton} type="button" onClick={requestSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          <button type="button" onClick={retryCheck} disabled={signingOut}>Check session</button>
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
