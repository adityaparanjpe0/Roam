import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { startGoogleSignIn } from '../../api/auth'
import { useAuth } from '../auth/authContext'
import SavedTripList from './SavedTripList'
import { useSavedTrips } from './useSavedTrips'
import { savedTripsFeedback } from './savedTripsFeedback'
import './SavedTrips.css'

function OwnedTrips({ retryAuth }: { retryAuth: () => void }) {
  const { state, refresh, nextPage, previousPage, hasPreviousPage } = useSavedTrips()
  const loading = state.status === 'loading'
  const feedback = state.status === 'error' ? savedTripsFeedback(state.error) : null
  const accountRecovery = feedback?.recovery === 'account'
  const errorHeadingId = useId()
  const errorMessageId = useId()
  const errorMessage = useRef<HTMLParagraphElement>(null)
  const resultMessage = useRef<HTMLParagraphElement>(null)
  const recoveryFocus = useRef(false)

  useLayoutEffect(() => {
    if (!recoveryFocus.current || state.status === 'loading') return
    recoveryFocus.current = false
    if (state.status === 'error') errorMessage.current?.focus()
    else resultMessage.current?.focus()
  }, [state])

  function retryRequest() {
    recoveryFocus.current = true
    refresh()
  }

  return (
    <div className="saved-trips-results" aria-busy={loading}>
      {loading && <>
        <p className="saved-trips-status" role="status" aria-atomic="true">Loading saved trips…</p>
        <div className="saved-trips-skeletons" aria-hidden="true"><div /><div /><div /></div>
      </>}
      {state.status === 'error' && feedback && <div className="saved-trips-panel saved-trips-error" role="group" aria-labelledby={errorHeadingId}>
        <h2 id={errorHeadingId}>{feedback.title}</h2>
        <p ref={errorMessage} id={errorMessageId} tabIndex={-1} role="alert" aria-atomic="true">{state.error.message}</p>
        {accountRecovery && <button type="button" onClick={retryAuth} aria-describedby={errorMessageId}>{feedback.action}</button>}
      </div>}
      {state.status === 'success' && <>
        <p ref={resultMessage} tabIndex={-1} className="saved-trips-status" role="status" aria-atomic="true">{state.page.items.length > 0 ? `${state.page.items.length} saved ${state.page.items.length === 1 ? 'trip' : 'trips'} on this page.`
          : hasPreviousPage ? 'No trips on this page. Refresh to load the latest trips.' : 'You haven’t saved any trips yet.'}</p>
        {state.page.items.length > 0 ? <SavedTripList trips={state.page.items} /> : <div className="saved-trips-panel saved-trips-empty">
          <span className="saved-trips-empty-symbol" aria-hidden="true">↗</span>
          <h2>{hasPreviousPage ? 'Your plans may have moved.' : 'Room for your next adventure.'}</h2>
          <p>{hasPreviousPage ? 'Return to the previous page or refresh your saved trips.' : 'Choose a destination and save your trip details. You can revisit them here whenever you’re ready.'}</p>
          {!hasPreviousPage && <a className="primary-link" href="/#create-trip">Plan your first trip</a>}
        </div>}
      </>}
      {!accountRecovery && <div className="saved-trips-actions">
        <button type="button" onClick={retryRequest} disabled={loading}>
          {state.status === 'error' ? 'Retry loading trips' : 'Refresh trips'}
        </button>
        {hasPreviousPage && <button type="button" onClick={previousPage} disabled={loading}>Previous page</button>}
        {state.status === 'success' && state.page.next_cursor !== null && <button type="button" onClick={nextPage}>Next page</button>}
      </div>}
    </div>
  )
}

function DashboardSignIn({ buttonRef }: { buttonRef: RefObject<HTMLButtonElement | null> }) {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const helpId = useId()

  function signIn() {
    if (pending.current) return
    pending.current = true
    setLeaving(true)
    setError(false)
    try { startGoogleSignIn() } catch {
      pending.current = false
      setLeaving(false)
      setError(true)
    }
  }

  return <div className="saved-trips-sign-in" aria-busy={leaving}>
    <button ref={buttonRef} type="button" onClick={signIn} disabled={leaving} aria-describedby={helpId}>
      {leaving ? 'Opening sign-in…' : 'Sign in with Google'}
    </button>
    <p id={helpId}>Signing in leaves this page and clears unsaved trip details.</p>
    {error && <p role="alert">Could not open sign-in. Try again.</p>}
  </div>
}

function SavedTripsDashboard({ page = false }: { page?: boolean }) {
  const auth = useAuth()
  const heading = useRef<HTMLHeadingElement>(null)
  const signInButton = useRef<HTMLButtonElement>(null)
  const accountError = useRef<HTMLParagraphElement>(null)
  const accountRecoveryFocus = useRef(false)
  const Heading = page ? 'h1' : 'h2'
  useLayoutEffect(() => { if (page) heading.current?.focus() }, [page])
  useLayoutEffect(() => {
    if (auth.signingOut) {
      accountRecoveryFocus.current = false
      return
    }
    if (!accountRecoveryFocus.current || auth.state.status === 'loading') return
    accountRecoveryFocus.current = false
    if (auth.state.status === 'unauthenticated') signInButton.current?.focus()
    else if (auth.state.status === 'error') accountError.current?.focus()
    else heading.current?.focus()
  }, [auth.state, auth.signingOut])

  function retryAccount() {
    accountRecoveryFocus.current = true
    auth.retry()
  }
  let content: ReactNode

  if (auth.signingOut) {
    content = <p role="status" aria-atomic="true">Signing out. Saved trips are hidden.</p>
  } else if (auth.state.status === 'loading') {
    content = <div className="saved-trips-panel"><p role="status" aria-atomic="true">Checking sign-in before loading saved trips…</p></div>
  } else if (auth.state.status === 'error') {
    content = <div className="saved-trips-panel saved-trips-error">
      <h2>Account status unavailable</h2>
      <p ref={accountError} tabIndex={-1} role="alert">Could not confirm your account. Saved trips are hidden.</p>
      <button type="button" onClick={retryAccount}>Retry account check</button>
    </div>
  } else if (auth.state.status === 'unauthenticated') {
    content = <div className="saved-trips-panel">
      <h2>Sign in to view your trips</h2>
      <p role="status" aria-atomic="true">Sign in to see your saved trips.</p>
      {auth.state.notice && <p>{auth.state.notice}</p>}
      <DashboardSignIn buttonRef={signInButton} />
    </div>
  } else {
    // A new account gets a fresh hook instance, never the previous user's state.
    content = <OwnedTrips key={auth.state.user.id} retryAuth={retryAccount} />
  }

  return (
    <section className="saved-trips page-width" id="my-trips" tabIndex={-1} aria-labelledby="my-trips-heading">
      <header className="saved-trips-heading">
        <div>
          <p className="saved-trips-eyebrow">Your travel journal</p>
          <Heading ref={heading} tabIndex={-1} id="my-trips-heading">My Trips</Heading>
          <p className="saved-trips-description">A place for the trips you’re looking forward to.</p>
          <p className="saved-trips-description">Most recently updated first.</p>
        </div>
        <a className="saved-trips-new primary-link" href="/#create-trip"><span aria-hidden="true">+</span> Plan a New Trip</a>
      </header>
      <div className="saved-trips-content">{content}</div>
      <p className="saved-trips-note">Saved trip details from your account. Itinerary planning is not available yet.</p>
    </section>
  )
}

export default SavedTripsDashboard
