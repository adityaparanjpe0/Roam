import type { TripApiError } from '../../api/trips'

interface SavedTripsFeedback {
  title: string
  recovery: 'account' | 'request'
  action: string
}

/** UI recovery policy only; the client owns safe messages and the server authorizes. */
export function savedTripsFeedback(error: TripApiError): SavedTripsFeedback {
  if (error.code === 'AUTHENTICATION_REQUIRED') {
    return { title: 'Check your sign-in', recovery: 'account', action: 'Recheck sign-in' }
  }
  if (error.code === 'FORBIDDEN' || error.status === 403) {
    return { title: 'Request not permitted', recovery: 'account', action: 'Check account' }
  }
  if (error.code === 'AUTH_NOT_CONFIGURED') {
    return { title: 'Sign-in is unavailable', recovery: 'account', action: 'Retry account check' }
  }
  const title = error.code === 'NETWORK_ERROR' ? 'Connection unavailable'
    : error.code === 'TIMEOUT' ? 'Loading took too long' : 'Saved trips couldn’t be loaded'
  return { title, recovery: 'request', action: 'Retry loading trips' }
}
