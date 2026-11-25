import { useLayoutEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../features/auth/authContext'
import SavedTripDetails from '../features/trip/SavedTripDetails'
import { useSavedTrip } from '../features/trip/useSavedTrip'
import { savedTripsFeedback } from '../features/trip/savedTripsFeedback'
import '../features/trip/SavedTrips.css'
import '../features/trip/TripDetails.css'

function OwnedTrip({ tripId, retryAuth }: { tripId: string; retryAuth: () => void }) {
  const { state, retry } = useSavedTrip(tripId)
  const alert = useRef<HTMLParagraphElement>(null)
  const result = useRef<HTMLDivElement>(null)
  const recoveryFocus = useRef(false)
  useLayoutEffect(() => {
    if (!recoveryFocus.current || state.status === 'loading') return
    recoveryFocus.current = false
    if (state.status === 'error') alert.current?.focus()
    else result.current?.focus()
  }, [state])

  if (state.status === 'loading') return <div aria-busy="true"><p role="status" aria-atomic="true">Loading trip details…</p></div>
  if (state.status === 'success') return <div ref={result} tabIndex={-1}><SavedTripDetails trip={state.trip} /></div>

  const unavailable = state.error.code === 'RESOURCE_NOT_FOUND'
  const invalid = state.error.code === 'VALIDATION_FAILED'
  const feedback = savedTripsFeedback(state.error)
  return <section className="saved-trips-panel" aria-labelledby="trip-error-heading">
    <h2 id="trip-error-heading">{unavailable ? 'Trip not found or unavailable' : invalid ? 'Invalid trip link' : feedback.recovery === 'account' ? feedback.title : 'Trip details could not be loaded'}</h2>
    <p ref={alert} tabIndex={-1} role="alert">{unavailable ? 'This trip could not be found or is not accessible to your account.' : invalid ? 'Check the trip URL or return to My Trips.' : state.error.message}</p>
    {!unavailable && !invalid && <button type="button" onClick={feedback.recovery === 'account' ? retryAuth : () => { recoveryFocus.current = true; retry() }}>
      {feedback.recovery === 'account' ? feedback.action : 'Retry loading trip'}
    </button>}
  </section>
}

function TripDetailsPage() {
  const { tripId = '' } = useParams<'tripId'>()
  const auth = useAuth()
  const heading = useRef<HTMLHeadingElement>(null)
  const accountRecoveryFocus = useRef(false)
  useLayoutEffect(() => { heading.current?.focus() }, [tripId])
  useLayoutEffect(() => {
    if (auth.signingOut) { accountRecoveryFocus.current = false; return }
    if (!accountRecoveryFocus.current || auth.state.status === 'loading') return
    accountRecoveryFocus.current = false
    heading.current?.focus()
  }, [auth.state, auth.signingOut])
  function retryAccount() { accountRecoveryFocus.current = true; auth.retry() }

  return <main className="route-shell saved-trips trip-details page-width" id="main-content" tabIndex={-1}>
    <p className="saved-trips-eyebrow">Your travel journal</p>
    <h1 ref={heading} tabIndex={-1}>Trip details</h1>
    <Link className="trip-details-back" to="/trips">Back to My Trips</Link>
    {auth.signingOut ? <p role="status">Signing out. Trip details are hidden.</p>
      : auth.state.status === 'loading' ? <p role="status">Checking sign-in before loading trip details…</p>
        : auth.state.status === 'error' ? <div className="saved-trips-panel">
          <p role="alert">Could not confirm your account. Trip details are hidden.</p>
          <button type="button" onClick={retryAccount}>Retry account check</button>
        </div>
          : auth.state.status === 'unauthenticated' ? <div className="saved-trips-panel">
            <h2>Sign in to view this trip</h2>
            <p role="status">Use the sign-in action in the account controls to view saved trip details.</p>
            {auth.state.notice && <p>{auth.state.notice}</p>}
          </div>
            : <OwnedTrip key={`${auth.state.user.id}:${tripId}`} tripId={tripId} retryAuth={retryAccount} />}
  </main>
}

export default TripDetailsPage
