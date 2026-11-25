import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { AuthContext } from '../features/auth/authContext'
import type { AuthState } from '../features/auth/authContext'
import TripDetailsPage from './TripDetailsPage'
import { authUser, savedTrip } from '../test/tripFixtures'
import { deferred } from '../test/deferred'

const user = authUser()
const trip = savedTrip()
const otherId = '00000000-0000-0000-0000-000000000002'
const authenticated: AuthState = { status: 'authenticated', user }
const retryAuth = vi.fn()
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => { void navigate(`/trips/${otherId}`) }}>Other trip</button>
}
function page(state: AuthState = authenticated, signingOut = false, id = trip.id) {
  return <AuthContext value={{ state, signingOut, retry: retryAuth, signOut: vi.fn() }}>
    <MemoryRouter initialEntries={[`/trips/${id}`]}><Navigation /><Routes>
      <Route path="/trips/:tripId" element={<TripDetailsPage />} />
      <Route path="/trips" element={<h1>Dashboard destination</h1>} />
    </Routes></MemoryRouter>
  </AuthContext>
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); retryAuth.mockReset() })

test('loads canonical details from the UUID, formats saved facts, and navigates back', async () => {
  const pending = deferred<Response>()
  const fetch = vi.fn().mockReturnValue(pending.promise)
  vi.stubGlobal('fetch', fetch)
  render(page())
  expect(screen.getByRole('status')).toHaveTextContent('Loading trip details')
  await act(async () => { pending.resolve(Response.json(trip)) })
  expect(screen.getByRole('heading', { name: trip.title })).toBeInTheDocument()
  for (const text of ['Lisbon, Portugal', 'Europe/Lisbon', 'Mar 27, 2027', '2 travelers', 'USD 750.50 for the entire trip', 'Art and culture']) expect(screen.getByText(text)).toBeInTheDocument()
  expect(screen.getByText(/Quiet mornings/)).toHaveTextContent('Vegetarian meals')
  expect(screen.getByText(/without itinerary activities/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /generate|edit|export|delete/i })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/trips/${trip.id}`, expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }))
  fireEvent.click(screen.getByRole('link', { name: 'Back to My Trips' }))
  expect(await screen.findByRole('heading', { name: 'Dashboard destination' })).toBeInTheDocument()
})

test('nullable fields and empty interests stay unknown rather than fabricated', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...trip, budget_per_person_minor: null, interests: [], free_text_constraints: null, status: 'ready' })))
  render(page())
  expect(await screen.findByText('Not specified')).toBeInTheDocument()
  expect(screen.getByText('No interests provided.')).toBeInTheDocument()
  expect(screen.getByText('No additional preferences provided.')).toBeInTheDocument()
  expect(screen.queryByText(/no itinerary has been generated/i)).not.toBeInTheDocument()
})

test.each<AuthState>([{ status: 'loading' }, { status: 'unauthenticated', notice: 'Your session ended. Sign in again.' }, { status: 'error', message: 'Account unavailable' }])('never requests protected details for auth %j', (state) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(page(state))
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByText(trip.title)).not.toBeInTheDocument()
})

test('an invalid UUID has a safe terminal state without a network request', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(page(authenticated, false, 'not-a-uuid'))
  expect(await screen.findByRole('heading', { name: 'Invalid trip link' })).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Retry loading trip' })).not.toBeInTheDocument()
})

test.each([404, 401, 403, 500, 503])('handles HTTP %s without exposing response details', async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response('PRIVATE_SERVER_STACK', { status }))
  vi.stubGlobal('fetch', fetch)
  render(page())
  expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE')
  expect(screen.queryByText(trip.title)).not.toBeInTheDocument()
  if (status === 404) {
    expect(screen.getByRole('heading', { name: 'Trip not found or unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry|account|sign-in/i })).not.toBeInTheDocument()
  } else if (status === 401 || status === 403) {
    fireEvent.click(screen.getByRole('button', { name: status === 401 ? 'Recheck sign-in' : 'Check account' }))
    expect(retryAuth).toHaveBeenCalledTimes(1)
  } else expect(screen.getByRole('button', { name: 'Retry loading trip' })).toBeEnabled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('network failure supports one explicit retry, loading and focused success', async () => {
  const pending = deferred<Response>()
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('PRIVATE_NETWORK')).mockReturnValueOnce(pending.promise)
  vi.stubGlobal('fetch', fetch)
  render(page())
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection')
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading trip' }))
  expect(screen.getByRole('status')).toHaveTextContent('Loading trip details')
  await act(async () => { pending.resolve(Response.json(trip)) })
  expect(screen.getByRole('heading', { name: trip.title }).parentElement?.parentElement).toHaveFocus()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test.each(['sign-out', 'account-change', 'route-change'] as const)('aborts and ignores a late result on %s', async (change) => {
  const pending = deferred<Response>()
  let signal: AbortSignal | undefined
  const fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    if (!signal) { signal = options.signal ?? undefined; return pending.promise }
    return Promise.resolve(Response.json({ ...trip, id: otherId, title: 'New trip' }))
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(page())
  if (change === 'route-change') fireEvent.click(screen.getByRole('button', { name: 'Other trip' }))
  else if (change === 'sign-out') view.rerender(page(authenticated, true))
  else view.rerender(page({ status: 'authenticated', user: { ...user, id: otherId } }))
  await waitFor(() => { expect(signal?.aborted).toBe(true) })
  await act(async () => { pending.resolve(Response.json(trip)) })
  expect(screen.queryByText(trip.title)).not.toBeInTheDocument()
  if (change !== 'sign-out') expect(await screen.findByRole('heading', { name: 'New trip' })).toBeInTheDocument()
})

test('Strict Mode cancels the rehearsal and keeps only the current request', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(trip)))
  vi.stubGlobal('fetch', fetch)
  render(<StrictMode>{page()}</StrictMode>)
  expect(await screen.findByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('auth resolution starts one read; profile renders do not refetch and logout clears resolved data', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(trip)))
  vi.stubGlobal('fetch', fetch)
  const view = render(page({ status: 'loading' }))
  expect(fetch).not.toHaveBeenCalled()
  view.rerender(page())
  expect(await screen.findByRole('heading', { name: trip.title })).toBeInTheDocument()
  view.rerender(page({ status: 'authenticated', user: { ...user, display_name: 'Updated profile' } }))
  expect(fetch).toHaveBeenCalledTimes(1)
  view.rerender(page({ status: 'unauthenticated' }))
  expect(screen.queryByText(trip.title)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sign in to view this trip' })).toBeInTheDocument()
})

test('a client timeout shows safe retry feedback without an automatic retry', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) })
  }))
  vi.stubGlobal('fetch', fetch)
  render(page())
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByRole('alert')).toHaveTextContent('Loading trips timed out')
  expect(screen.getByRole('button', { name: 'Retry loading trip' })).toBeEnabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a malformed successful response never becomes saved content', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...trip, traveler_count: 'PRIVATE' })))
  render(page())
  expect(await screen.findByRole('alert')).toHaveTextContent('unexpected trip response')
  expect(screen.queryByText(trip.title)).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE')
})

test('a late failed request cannot replace a newer successful route', async () => {
  const old = deferred<Response>()
  const fetch = vi.fn().mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(Response.json(savedTrip({ id: otherId, title: 'Newer route trip' })))
  vi.stubGlobal('fetch', fetch)
  render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Other trip' }))
  expect(await screen.findByRole('heading', { name: 'Newer route trip' })).toBeInTheDocument()
  await act(async () => { old.reject(new TypeError('PRIVATE_LATE_FAILURE')) })
  expect(screen.getByRole('heading', { name: 'Newer route trip' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/v1/trips/${trip.id}`, `/api/v1/trips/${otherId}`])
})
