import { useLayoutEffect, useRef } from 'react'
import { useAuth } from '../features/auth/authContext'

/** Navigation destination only; canonical detail loading remains future work. */
function TripPageShell() {
  const auth = useAuth()
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => { heading.current?.focus() }, [])

  return (
    <main className="route-shell page-width" id="main-content" tabIndex={-1}>
      <p className="saved-trips-eyebrow">Your travel journal</p>
      <h1 ref={heading} tabIndex={-1}>Trip details</h1>
      {auth.signingOut ? <p role="status">Signing out. Trip details are hidden.</p>
        : auth.state.status === 'loading' ? <p role="status">Checking sign-in…</p>
          : auth.state.status === 'error' ? <>
            <p role="alert">Could not confirm your account.</p>
            <button type="button" onClick={auth.retry}>Retry account check</button>
          </>
            : auth.state.status === 'unauthenticated' ? <p>Sign in using the account controls to view saved trips.</p>
              : <p>The detailed trip view is not available yet. You can view your saved trip summaries in My Trips.</p>}
      <a className="primary-link" href="/trips">Back to My Trips</a>
    </main>
  )
}

export default TripPageShell
