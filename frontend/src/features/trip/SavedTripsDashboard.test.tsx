import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import * as tripApi from '../../api/trips'
import * as authApi from '../../api/auth'
import type { TripListResponse, TripSummary } from '../../api/trips'
import AuthProvider from '../auth/AuthProvider'
import { AuthContext } from '../auth/authContext'
import type { AuthState } from '../auth/authContext'
import SavedTripsDashboard from './SavedTripsDashboard'
import SavedTripList from './SavedTripList'
import App from '../../App'

const alice = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
const bob = { id: '00000000-0000-0000-0000-000000000002', email: 'bob@example.com', display_name: 'Bob' }
const trip: TripSummary = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Alice trip', destination_label: 'Lisbon',
  start_date: '2027-03-27', end_date: '2027-03-30', version: 1, updated_at: '2026-11-24T12:00:00Z',
}
const page: TripListResponse = { items: [trip], next_cursor: null }
const empty: TripListResponse = { items: [], next_cursor: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function dashboard(state: AuthState, signingOut = false, retry = vi.fn()) {
  return <AuthContext value={{ state, signingOut, retry, signOut: vi.fn() }}><SavedTripsDashboard /></AuthContext>
}

function region() { return within(screen.getByRole('region', { name: 'My Trips' })) }

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

test.each<AuthState>([
  { status: 'loading' }, { status: 'unauthenticated' }, { status: 'error', message: 'Could not check account.' },
])('does not mount protected fetching while auth is $status', (state) => {
  const list = vi.spyOn(tripApi, 'listTrips')
  render(dashboard(state))
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  expect(list).not.toHaveBeenCalled()
})

test('waits for authentication, shows request loading, then displays only returned metadata', async () => {
  const pending = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockReturnValue(pending.promise)
  const view = render(dashboard({ status: 'loading' }))
  expect(region().getByRole('status')).toHaveTextContent('Checking sign-in')
  expect(list).not.toHaveBeenCalled()
  view.rerender(dashboard({ status: 'authenticated', user: alice }))
  expect(region().getByRole('status')).toHaveTextContent('Loading saved trips')
  expect(region().getByRole('button', { name: 'Refresh trips' })).toBeDisabled()
  expect(list).toHaveBeenCalledExactlyOnceWith({ limit: 20, cursor: null }, expect.any(AbortSignal))
  await act(async () => { pending.resolve(page) })
  expect(region().getByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(region().getByText('Lisbon')).toBeInTheDocument()
  expect(region().getByText('Mar 27, 2027')).toHaveAttribute('datetime', '2027-03-27')
  expect(region().getByRole('status')).toHaveTextContent('1 saved trip on this page.')
  expect(region().queryByText(/activity|budget/i)).not.toBeInTheDocument()
  expect(region().getByRole('link', { name: 'Plan a New Trip' })).toHaveAttribute('href', '/#create-trip')
})

test('a successful empty page is distinct from loading, auth failure and request failure', async () => {
  vi.spyOn(tripApi, 'listTrips').mockResolvedValue(empty)
  render(dashboard({ status: 'authenticated', user: alice }))
  expect(await region().findByText('You haven’t saved any trips yet.')).toBeInTheDocument()
  expect(region().queryByRole('alert')).not.toBeInTheDocument()
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  expect(region().queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
})

test('a failed request shows a safe error and retries explicitly from the first page', async () => {
  const pending = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockRejectedValueOnce(new TypeError('PRIVATE_ERROR')).mockReturnValueOnce(pending.promise)
  render(dashboard({ status: 'authenticated', user: alice }))
  expect(await region().findByRole('alert')).toHaveTextContent('Could not load trips.')
  expect(region().queryByText('You haven’t saved any trips yet.')).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE_ERROR')
  const button = region().getByRole('button', { name: 'Retry loading trips' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(list).toHaveBeenCalledTimes(2)
  expect(region().getByRole('status')).toHaveTextContent('Loading saved trips')
  await act(async () => { pending.resolve(page) })
  expect(region().getByRole('heading', { name: trip.title })).toBeInTheDocument()
})

test('refresh clears displayed results until a new canonical page arrives and writes no storage', async () => {
  const pending = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockResolvedValueOnce(page).mockReturnValueOnce(pending.promise)
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(dashboard({ status: 'authenticated', user: alice }))
  await region().findByRole('heading', { name: trip.title })
  fireEvent.click(region().getByRole('button', { name: 'Refresh trips' }))
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  await act(async () => { pending.resolve(empty) })
  expect(region().getByText('You haven’t saved any trips yet.')).toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(2)
  expect(storage).not.toHaveBeenCalled()
})

test('new auth objects and callbacks for the same user do not restart fetching or poll', async () => {
  vi.useFakeTimers()
  const list = vi.spyOn(tripApi, 'listTrips').mockResolvedValue(page)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  await act(async () => {})
  view.rerender(dashboard({ status: 'authenticated', user: { ...alice, display_name: 'New name' } }))
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(region().getByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(1)
})

test('cursor navigation uses one bounded page at a time and refresh resets cursor history', async () => {
  const second = { ...trip, id: bob.id, title: 'Second page trip' }
  const list = vi.spyOn(tripApi, 'listTrips')
    .mockResolvedValueOnce({ ...page, next_cursor: 'opaque_cursor' })
    .mockResolvedValueOnce({ items: [second], next_cursor: null })
    .mockResolvedValueOnce({ ...page, next_cursor: 'opaque_cursor' })
    .mockResolvedValueOnce({ items: [second], next_cursor: null })
    .mockResolvedValueOnce(empty)
  render(dashboard({ status: 'authenticated', user: alice }))
  fireEvent.click(await region().findByRole('button', { name: 'Next page' }))
  await region().findByRole('heading', { name: second.title })
  expect(region().queryByRole('heading', { name: trip.title })).not.toBeInTheDocument()
  expect(list).toHaveBeenNthCalledWith(2, { limit: 20, cursor: 'opaque_cursor' }, expect.any(AbortSignal))
  fireEvent.click(region().getByRole('button', { name: 'Previous page' }))
  fireEvent.click(await region().findByRole('button', { name: 'Next page' }))
  await region().findByRole('heading', { name: second.title })
  fireEvent.click(region().getByRole('button', { name: 'Refresh trips' }))
  await region().findByText('You haven’t saved any trips yet.')
  expect(list).toHaveBeenLastCalledWith({ limit: 20, cursor: null }, expect.any(AbortSignal))
  expect(region().queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(5)
})

test('an empty later page does not claim the account has no saved trips', async () => {
  vi.spyOn(tripApi, 'listTrips').mockResolvedValueOnce({ ...page, next_cursor: 'next' }).mockResolvedValueOnce(empty)
  render(dashboard({ status: 'authenticated', user: alice }))
  fireEvent.click(await region().findByRole('button', { name: 'Next page' }))
  expect(await region().findByText('No trips on this page. Refresh to load the latest trips.')).toBeInTheDocument()
  expect(region().getByRole('button', { name: 'Previous page' })).toBeEnabled()
  expect(region().queryByText('You haven’t saved any trips yet.')).not.toBeInTheDocument()
})

test.each(['success', 'failure'])('an old account request cannot overwrite a new account after late %s', async (outcome) => {
  const old = deferred<TripListResponse>()
  const current = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  const oldSignal = list.mock.calls[0][1]
  view.rerender(dashboard({ status: 'authenticated', user: bob }))
  expect(oldSignal?.aborted).toBe(true)
  expect(region().getByRole('status')).toHaveTextContent('Loading saved trips')
  const bobTrip = { ...trip, id: bob.id, title: 'Bob trip' }
  await act(async () => { current.resolve({ items: [bobTrip], next_cursor: null }) })
  // The substituted request deliberately ignores abort, proving the stale guard too.
  await act(async () => { if (outcome === 'success') old.resolve(page); else old.reject(new Error('PRIVATE')) })
  expect(region().getByRole('heading', { name: 'Bob trip' })).toBeInTheDocument()
  expect(region().queryByRole('heading', { name: trip.title })).not.toBeInTheDocument()
  expect(region().queryByRole('alert')).not.toBeInTheDocument()
  expect(list.mock.calls[1][1]?.aborted).toBe(false)
})

test('previously rendered data is removed immediately on an account change', async () => {
  const pending = deferred<TripListResponse>()
  vi.spyOn(tripApi, 'listTrips').mockResolvedValueOnce(page).mockReturnValueOnce(pending.promise)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  await region().findByRole('heading', { name: trip.title })
  view.rerender(dashboard({ status: 'authenticated', user: bob }))
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  expect(region().getByRole('status')).toHaveTextContent('Loading saved trips')
  await act(async () => { pending.resolve(empty) })
})

test.each<AuthState>([
  { status: 'unauthenticated' }, { status: 'loading' }, { status: 'error', message: 'Account unavailable.' },
])('losing confirmed auth clears trip state and reauthentication starts fresh: $status', async (next) => {
  const list = vi.spyOn(tripApi, 'listTrips').mockResolvedValueOnce(page).mockResolvedValueOnce(empty)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  await region().findByRole('heading', { name: trip.title })
  view.rerender(dashboard(next))
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  view.rerender(dashboard({ status: 'authenticated', user: alice }))
  expect(region().queryByRole('heading', { name: trip.title })).not.toBeInTheDocument()
  await region().findByText('You haven’t saved any trips yet.')
  expect(list).toHaveBeenCalledTimes(2)
})

test('signing out aborts pending work and late responses cannot restore hidden trips', async () => {
  const pending = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockReturnValue(pending.promise)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  view.rerender(dashboard({ status: 'authenticated', user: alice }, true))
  expect(list.mock.calls[0][1]?.aborted).toBe(true)
  expect(region().getByRole('status')).toHaveTextContent('Signing out. Saved trips are hidden.')
  await act(async () => { pending.resolve(page) })
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(1)
})

test('leaving the dashboard aborts the request and returning makes a fresh request', async () => {
  const pending = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty)
  const view = render(dashboard({ status: 'authenticated', user: alice }))
  view.unmount()
  expect(list.mock.calls[0][1]?.aborted).toBe(true)
  render(dashboard({ status: 'authenticated', user: alice }))
  await region().findByText('You haven’t saved any trips yet.')
  await act(async () => { pending.resolve(page) })
  expect(region().queryByRole('list')).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(2)
})

test('Strict Mode cancels its replayed effect and ignores a late first response', async () => {
  const first = deferred<TripListResponse>()
  const list = vi.spyOn(tripApi, 'listTrips').mockReturnValueOnce(first.promise).mockResolvedValueOnce(empty)
  render(<StrictMode>{dashboard({ status: 'authenticated', user: alice })}</StrictMode>)
  await region().findByText('You haven’t saved any trips yet.')
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls[0][1]?.aborted).toBe(true)
  await act(async () => { first.resolve(page) })
  expect(region().queryByRole('list')).not.toBeInTheDocument()
})

test('401 offers explicit existing auth recovery without automatic retry loops', async () => {
  const list = vi.spyOn(tripApi, 'listTrips').mockRejectedValue(new tripApi.TripApiError('AUTHENTICATION_REQUIRED', 401, undefined, {}, 'read'))
  const retry = vi.fn()
  render(dashboard({ status: 'authenticated', user: alice }, false, retry))
  expect(await region().findByRole('alert')).toHaveTextContent('Sign in to view your saved trips.')
  expect(retry).not.toHaveBeenCalled()
  expect(region().getByRole('button', { name: 'Retry loading trips' })).toBeDisabled()
  fireEvent.click(region().getByRole('button', { name: 'Recheck sign-in' }))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledTimes(1)
})

test('auth failures reuse the existing retry action', () => {
  const retry = vi.fn()
  render(dashboard({ status: 'error', message: 'Account unavailable.' }, false, retry))
  fireEvent.click(region().getByRole('button', { name: 'Retry account check' }))
  expect(retry).toHaveBeenCalledTimes(1)
})

test('the presentation list needs no auth provider and renders titles as literal text', () => {
  const list = vi.spyOn(tripApi, 'listTrips')
  const title = '<img src=x onerror=alert(1)>'
  const view = render(<SavedTripList trips={[{ ...trip, title }]} />)
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
  expect(list).not.toHaveBeenCalled()
})

test('the real auth lifecycle refreshes the same profile without trip refetches, and changes accounts safely', async () => {
  const check = vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce(alice).mockResolvedValueOnce({ ...alice }).mockResolvedValueOnce(bob)
  const list = vi.spyOn(tripApi, 'listTrips').mockResolvedValueOnce(page).mockResolvedValueOnce(empty)
  render(<AuthProvider><SavedTripsDashboard /></AuthProvider>)
  await region().findByRole('heading', { name: trip.title })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
  expect(list).toHaveBeenCalledTimes(1)
  fireEvent(window, new Event('focus'))
  await region().findByText('You haven’t saved any trips yet.')
  expect(list).toHaveBeenCalledTimes(2)
  expect(region().queryByRole('heading', { name: trip.title })).not.toBeInTheDocument()
})

test('the dashboard page waits for /me and uses the real typed client', async () => {
  // The dashboard now has its own page. Form preservation is covered by App/auth tests.
  window.history.replaceState(null, '', '/trips')
  vi.stubEnv('DEV', false)
  const me = deferred<Response>()
  const fetch = vi.fn((path: string) => {
    if (path === '/api/auth/me') return me.promise
    if (path === '/api/v1/trips?limit=20') return Promise.resolve(Response.json(page))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { me.resolve(Response.json({ user: alice })) })
  expect(region().getByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch).toHaveBeenLastCalledWith('/api/v1/trips?limit=20', expect.objectContaining({
    credentials: 'same-origin', method: 'GET', signal: expect.any(AbortSignal),
  }))
})
