import { useEffect, useRef, useState } from 'react'
import { listTrips, TripApiError } from '../../api/trips'
import type { TripListResponse } from '../../api/trips'

export type SavedTripsState =
  | { status: 'loading' }
  | { status: 'success'; page: TripListResponse }
  | { status: 'error'; error: TripApiError }

/** Mount inside the dashboard's authenticated, user-keyed boundary only. */
export function useSavedTrips() {
  const [state, setState] = useState<SavedTripsState>({ status: 'loading' })
  const [pagination, setPagination] = useState<{ cursor: string | null; previous: (string | null)[] }>({ cursor: null, previous: [] })
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)
  const cursor = pagination.cursor

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    request.current = controller

    void listTrips({ limit: 20, cursor }, controller.signal).then((page) => {
      if (active && !controller.signal.aborted) setState({ status: 'success', page })
    }).catch((failure: unknown) => {
      if (!active || controller.signal.aborted) return
      const error = failure instanceof TripApiError ? failure
        : new TripApiError('NETWORK_ERROR', undefined, undefined, {}, 'read')
      setState({ status: 'error', error })
    }).finally(() => {
      if (request.current === controller) request.current = null
    })

    return () => {
      active = false
      controller.abort()
      if (request.current === controller) request.current = null
    }
  }, [cursor, attempt])

  function refresh() {
    if (state.status === 'loading') return
    setState({ status: 'loading' })
    setPagination({ cursor: null, previous: [] })
    setAttempt((previous) => previous + 1)
  }

  function nextPage() {
    if (state.status !== 'success' || state.page.next_cursor === null || request.current !== null) return
    const next = state.page.next_cursor
    setState({ status: 'loading' })
    setPagination((previous) => ({ cursor: next, previous: [...previous.previous, previous.cursor] }))
  }

  function previousPage() {
    if (state.status === 'loading' || pagination.previous.length === 0 || request.current !== null) return
    setState({ status: 'loading' })
    setPagination((previous) => ({ cursor: previous.previous.at(-1) ?? null, previous: previous.previous.slice(0, -1) }))
  }

  return { state, refresh, nextPage, previousPage, hasPreviousPage: pagination.previous.length > 0 }
}
