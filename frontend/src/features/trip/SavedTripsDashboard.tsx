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
    <div aria-busy={loading}>
      {loading && <p role="status">Loading saved trips…</p>}
      {state.status === 'error' && <>
        <p role="alert">{state.error.message}</p>
        {authenticationRequired && <button type="button" onClick={retryAuth}>Recheck sign-in</button>}
      </>}
      {state.status === 'success' && <>
        <p role="status">{state.page.items.length > 0 ? `${state.page.items.length} saved ${state.page.items.length === 1 ? 'trip' : 'trips'} on this page.`
          : hasPreviousPage ? 'No trips on this page. Refresh to load the latest trips.' : 'You haven’t saved any trips yet.'}</p>
        {state.page.items.length > 0 && <SavedTripList trips={state.page.items} />}
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

function SavedTripsDashboard() {
  const auth = useAuth()
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
      <h2 id="my-trips-heading">My Trips</h2>
      <p>Saved trip details from your account. Itinerary planning is not available yet.</p>
      {content}
      <a className="trip-entry-link" href="#create-trip">Create a trip</a>
    </section>
  )
}

export default SavedTripsDashboard
