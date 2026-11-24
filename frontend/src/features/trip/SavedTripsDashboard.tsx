import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/authContext'
import SavedTripList from './SavedTripList'
import { useSavedTrips } from './useSavedTrips'
import './SavedTrips.css'

function OwnedTrips({ retryAuth }: { retryAuth: () => void }) {
  const { state, refresh, nextPage, previousPage, hasPreviousPage } = useSavedTrips()
  const loading = state.status === 'loading'
  const authenticationRequired = state.status === 'error' && state.error.code === 'AUTHENTICATION_REQUIRED'

  return (
    <div className="saved-trips-results" aria-busy={loading}>
      {loading && <>
        <p className="saved-trips-status" role="status">Loading saved trips…</p>
        <div className="saved-trips-skeletons" aria-hidden="true"><div /><div /><div /></div>
      </>}
      {state.status === 'error' && <div className="saved-trips-panel saved-trips-error">
        <p role="alert">{state.error.message}</p>
        {authenticationRequired && <button type="button" onClick={retryAuth}>Recheck sign-in</button>}
      </div>}
      {state.status === 'success' && <>
        <p className="saved-trips-status" role="status">{state.page.items.length > 0 ? `${state.page.items.length} saved ${state.page.items.length === 1 ? 'trip' : 'trips'} on this page.`
          : hasPreviousPage ? 'No trips on this page. Refresh to load the latest trips.' : 'You haven’t saved any trips yet.'}</p>
        {state.page.items.length > 0 ? <SavedTripList trips={state.page.items} /> : <div className="saved-trips-panel saved-trips-empty">
          <span className="saved-trips-empty-symbol" aria-hidden="true">↗</span>
          <h2>{hasPreviousPage ? 'Your plans may have moved.' : 'Room for your next adventure.'}</h2>
          <p>{hasPreviousPage ? 'Return to the previous page or refresh your saved trips.' : 'Choose a destination and save your trip details. You can revisit them here whenever you’re ready.'}</p>
        </div>}
      </>}
      <div className="saved-trips-actions">
        <button type="button" onClick={refresh} disabled={loading || authenticationRequired}>
          {state.status === 'error' ? 'Retry loading trips' : 'Refresh trips'}
        </button>
        {hasPreviousPage && <button type="button" onClick={previousPage} disabled={loading || authenticationRequired}>Previous page</button>}
        {state.status === 'success' && state.page.next_cursor !== null && <button type="button" onClick={nextPage}>Next page</button>}
      </div>
    </div>
  )
}

function SavedTripsDashboard({ page = false }: { page?: boolean }) {
  const auth = useAuth()
  const heading = useRef<HTMLHeadingElement>(null)
  const Heading = page ? 'h1' : 'h2'
  useLayoutEffect(() => { if (page) heading.current?.focus() }, [page])
  let content: ReactNode

  if (auth.signingOut) {
    content = <p role="status">Signing out. Saved trips are hidden.</p>
  } else if (auth.state.status === 'loading') {
    content = <p role="status">Checking sign-in before loading saved trips…</p>
  } else if (auth.state.status === 'error') {
    content = <>
      <p role="alert">Could not confirm your account. Saved trips are hidden.</p>
      <button type="button" onClick={auth.retry}>Retry account check</button>
    </>
  } else if (auth.state.status === 'unauthenticated') {
    content = <p>Sign in using the account controls to view your saved trips.</p>
  } else {
    // A new account gets a fresh hook instance, never the previous user's state.
    content = <OwnedTrips key={auth.state.user.id} retryAuth={auth.retry} />
  }

  return (
    <section className="saved-trips page-width" id="my-trips" tabIndex={-1} aria-labelledby="my-trips-heading">
      <header className="saved-trips-heading">
        <div>
          <p className="saved-trips-eyebrow">Your travel journal</p>
          <Heading ref={heading} tabIndex={-1} id="my-trips-heading">My Trips</Heading>
          <p className="saved-trips-description">A place for the trips you’re looking forward to.</p>
        </div>
        <a className="saved-trips-new primary-link" href="/#create-trip"><span aria-hidden="true">+</span> Plan a New Trip</a>
      </header>
      <div className="saved-trips-content">{content}</div>
      <p className="saved-trips-note">Saved trip details from your account. Itinerary planning is not available yet.</p>
    </section>
  )
}

export default SavedTripsDashboard
