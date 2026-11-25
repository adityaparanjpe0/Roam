import { useEffect, useRef, useState } from 'react'
import { getTrip, TripApiError } from '../../api/trips'
import type { TripResponse } from '../../api/trips'

type SavedTripState =
  | { status: 'loading' }
  | { status: 'success'; trip: TripResponse }
  | { status: 'error'; error: TripApiError }

/** Mount inside an authenticated boundary keyed by account and trip ID. */
export function useSavedTrip(tripId: string) {
  const [state, setState] = useState<SavedTripState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(true)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void getTrip(tripId, controller.signal).then((trip) => {
      if (active && !controller.signal.aborted) setState({ status: 'success', trip })
    }).catch((failure: unknown) => {
      if (!active || controller.signal.aborted) return
      const error = failure instanceof TripApiError ? failure
        : new TripApiError('NETWORK_ERROR', undefined, undefined, {}, 'read')
      setState({ status: 'error', error })
    }).finally(() => { if (active) pending.current = false })
    return () => { active = false; controller.abort() }
  }, [tripId, attempt])

  function retry() {
    if (pending.current) return
    pending.current = true
    setState({ status: 'loading' })
    setAttempt((previous) => previous + 1)
  }

  return { state, retry }
}
