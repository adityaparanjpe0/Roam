import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import * as authApi from '../../api/auth'
import AuthProvider from '../auth/AuthProvider'
import AuthControls from '../auth/AuthControls'
import { AuthContext } from '../auth/authContext'
import SavedTripsDashboard from './SavedTripsDashboard'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
const trip = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'A saved trip', destination_label: 'Lisbon',
  start_date: '2027-03-27', end_date: '2027-03-30', version: 1, updated_at: '2026-11-24T12:00:00Z',
}
const populated = { items: [trip], next_cursor: null }
const empty = { items: [], next_cursor: null }
const csrf = 's'.repeat(43)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function dashboard() { return within(screen.getByRole('region', { name: 'My Trips' })) }

function renderAuthenticated() {
  return render(<AuthContext value={{ state: { status: 'authenticated', user }, signingOut: false, retry: vi.fn(), signOut: vi.fn() }}>
    <SavedTripsDashboard page />
  </AuthContext>)
}

function renderSession() { return render(<AuthProvider><AuthControls /><SavedTripsDashboard page /></AuthProvider>) }

afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks(); vi.useRealTimers()
})

test('auth loading and a confirmed guest never request protected data; sign-in reuses existing navigation', async () => {
  const me = deferred<Response>()
  const fetch = vi.fn().mockReturnValue(me.promise)
  const navigate = vi.spyOn(authApi, 'startGoogleSignIn').mockImplementation(() => {})
  vi.stubGlobal('fetch', fetch)
  renderSession()
  expect(dashboard().getByRole('status')).toHaveTextContent('Checking sign-in before loading saved trips')
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/auth/me', expect.anything())
  await act(async () => { me.resolve(new Response(null, { status: 401 })) })
  const signIn = dashboard().getByRole('button', { name: 'Sign in with Google' })
  expect(signIn).toHaveAccessibleDescription('Signing in leaves this page and clears unsaved trip details.')
  fireEvent.click(signIn); fireEvent.click(signIn)
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(dashboard().getByRole('button', { name: 'Opening sign-in…' })).toBeDisabled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('unknown authentication is a recoverable account error, not an empty or signed-out account', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('PRIVATE_SERVER_ERROR', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  renderSession()
  expect(await dashboard().findByRole('alert')).toHaveTextContent('Could not confirm your account')
  expect(dashboard().queryByText('You haven’t saved any trips yet.')).not.toBeInTheDocument()
  expect(dashboard().queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  expect(dashboard().getByRole('button', { name: 'Retry account check' })).toBeEnabled()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(document.body.textContent).not.toContain('PRIVATE')
})

test('a blocked sign-in navigation displays only safe feedback and can be retried', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  const navigate = vi.spyOn(authApi, 'startGoogleSignIn').mockImplementationOnce(() => { throw new Error('PRIVATE_NAVIGATION') }).mockImplementation(() => {})
  renderSession()
  fireEvent.click(await dashboard().findByRole('button', { name: 'Sign in with Google' }))
  expect(dashboard().getByRole('alert')).toHaveTextContent('Could not open sign-in. Try again.')
  expect(document.body.textContent).not.toContain('PRIVATE')
  fireEvent.click(dashboard().getByRole('button', { name: 'Sign in with Google' }))
  expect(navigate).toHaveBeenCalledTimes(2)
})

test.each([
  [401, 'Check your sign-in', 'Recheck sign-in'],
  [403, 'Request not permitted', 'Check account'],
  [500, 'Saved trips couldn’t be loaded', 'Retry loading trips'],
  [503, 'Saved trips couldn’t be loaded', 'Retry loading trips'],
] as const)('HTTP %i has distinct, safe feedback and an appropriate recovery action', async (status, title, action) => {
  const fetch = vi.fn().mockResolvedValue(new Response('PRIVATE stack trace / SQL / token', { status }))
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  expect(await dashboard().findByRole('heading', { name: title })).toBeInTheDocument()
  expect(dashboard().getByRole('alert')).toHaveAttribute('aria-atomic', 'true')
  expect(dashboard().getByRole('button', { name: action })).toBeEnabled()
  expect(dashboard().queryByRole('article')).not.toBeInTheDocument()
  expect(dashboard().queryByText('You haven’t saved any trips yet.')).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE')
  expect(fetch).toHaveBeenCalledTimes(1)
  if (status === 401 || status === 403) expect(dashboard().queryByRole('button', { name: 'Retry loading trips' })).not.toBeInTheDocument()
})

test('network failure keeps a recoverable error separate from empty results', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('PRIVATE_NETWORK'))
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  expect(await dashboard().findByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument()
  expect(dashboard().getByRole('alert')).toHaveTextContent('Check your connection')
  expect(dashboard().queryByText('You haven’t saved any trips yet.')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('an authentication-configuration outage offers account recovery without pretending the session ended', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {
    code: 'AUTH_NOT_CONFIGURED', message: 'PRIVATE_CONFIG', details: {}, request_id: '00000000-0000-0000-0000-000000000099',
  } }, { status: 503 })))
  renderAuthenticated()
  expect(await dashboard().findByRole('heading', { name: 'Sign-in is unavailable' })).toBeInTheDocument()
  expect(dashboard().getByRole('button', { name: 'Retry account check' })).toBeEnabled()
  expect(dashboard().queryByText('Your session ended. Sign in again.')).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE_CONFIG')
})

test('a real client timeout aborts fetch, offers retry and never polls', async () => {
  vi.useFakeTimers()
  let requestSignal: AbortSignal | null | undefined
  const fetch = vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    requestSignal = options.signal
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  expect(dashboard().getByRole('status')).toHaveTextContent('Loading saved trips')
  expect(screen.getByRole('region', { name: 'My Trips' }).querySelector('.saved-trips-results')).toHaveAttribute('aria-busy', 'true')
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(dashboard().getByRole('heading', { name: 'Loading took too long' })).toBeInTheDocument()
  expect(dashboard().getByRole('alert')).toHaveTextContent('Loading trips timed out. Try again.')
  expect(requestSignal?.aborted).toBe(true)
  expect(dashboard().getByRole('button', { name: 'Retry loading trips' })).toBeEnabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('explicit retry goes through loading to an intentional empty result and moves recovery focus', async () => {
  const pending = deferred<Response>()
  const fetch = vi.fn().mockResolvedValueOnce(new Response('PRIVATE', { status: 500 })).mockReturnValueOnce(pending.promise)
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  await dashboard().findByRole('alert')
  expect(screen.getByRole('heading', { name: 'My Trips', level: 1 })).toHaveFocus()
  const retry = dashboard().getByRole('button', { name: 'Retry loading trips' })
  fireEvent.click(retry); fireEvent.click(retry)
  expect(dashboard().getByRole('status')).toHaveTextContent('Loading saved trips')
  expect(dashboard().queryByRole('alert')).not.toBeInTheDocument()
  expect(dashboard().getByRole('button', { name: 'Refresh trips' })).toBeDisabled()
  await act(async () => { pending.resolve(Response.json(empty)) })
  expect(dashboard().getByRole('status')).toHaveTextContent('You haven’t saved any trips yet.')
  expect(dashboard().getByRole('status')).toHaveFocus()
  expect(dashboard().getByRole('link', { name: 'Plan your first trip' })).toHaveAttribute('href', '/#create-trip')
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a failed retry focuses safe feedback without restarting itself', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('PRIVATE', { status: 500 })))
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  await dashboard().findByRole('alert')
  fireEvent.click(dashboard().getByRole('button', { name: 'Retry loading trips' }))
  expect(await dashboard().findByRole('alert')).toHaveFocus()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test.each([401, 403])('HTTP %i during refresh cannot retain previously displayed authenticated data', async (status) => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(populated)).mockResolvedValueOnce(new Response('PRIVATE', { status }))
  vi.stubGlobal('fetch', fetch)
  renderAuthenticated()
  await dashboard().findByRole('article', { name: trip.title })
  fireEvent.click(dashboard().getByRole('button', { name: 'Refresh trips' }))
  expect(dashboard().queryByRole('article')).not.toBeInTheDocument()
  await dashboard().findByRole('alert')
  expect(dashboard().queryByText(trip.title)).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('401 recovery reuses /me expiration handling and focuses the visible sign-in action', async () => {
  let checks = 0
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(++checks === 1 ? Response.json({ user }) : new Response(null, { status: 401 }))
    if (url === '/api/v1/trips?limit=20') return Promise.resolve(new Response(null, { status: 401 }))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  renderSession()
  await dashboard().findByRole('alert')
  expect(fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(dashboard().getByRole('button', { name: 'Recheck sign-in' }))
  expect(await dashboard().findByText('Your session ended. Sign in again.')).toBeInTheDocument()
  expect(dashboard().getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(fetch.mock.calls.filter(([url]) => url.startsWith('/api/v1/trips'))).toHaveLength(1)
})

test('403 account recovery does not invent logout or bypass a repeated denial', async () => {
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === '/api/v1/trips?limit=20') return Promise.resolve(new Response(null, { status: 403 }))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  renderSession()
  await dashboard().findByRole('alert')
  fireEvent.click(dashboard().getByRole('button', { name: 'Check account' }))
  await dashboard().findByRole('alert')
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(dashboard().queryByRole('article')).not.toBeInTheDocument()
  expect(dashboard().queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(4)
})

test('real sign-out hides and cancels an in-progress list; late success cannot restore it', async () => {
  const tripResponse = deferred<Response>()
  const logoutResponse = deferred<Response>()
  let tripSignal: AbortSignal | null | undefined
  const fetch = vi.fn((url: string, options: RequestInit = {}) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === '/api/v1/trips?limit=20') { tripSignal = options.signal; return tripResponse.promise }
    if (url === '/api/auth/logout') return logoutResponse.promise
    throw new Error('Unexpected fixture endpoint')
  })
  document.cookie = `roam_csrf=${csrf}; Path=/`
  vi.stubGlobal('fetch', fetch)
  renderSession()
  await dashboard().findByText('Loading saved trips…')
  const account = within(screen.getByRole('region', { name: 'Account' }))
  fireEvent.click(account.getByRole('button', { name: 'Sign out' }))
  expect(dashboard().getByRole('status')).toHaveTextContent('Signing out. Saved trips are hidden.')
  await waitFor(() => expect(tripSignal?.aborted).toBe(true))
  await act(async () => { logoutResponse.resolve(new Response(null, { status: 204 })) })
  await act(async () => { tripResponse.resolve(Response.json(populated)) })
  expect(dashboard().queryByRole('article')).not.toBeInTheDocument()
  expect(dashboard().queryByRole('alert')).not.toBeInTheDocument()
  expect(account.getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/logout')).toHaveLength(1)
})
