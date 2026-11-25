import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../../App'
import AuthProvider from '../auth/AuthProvider'
import SavedTripsDashboard from './SavedTripsDashboard'
import { useSavedTrips } from './useSavedTrips'
import { AuthContext } from '../auth/authContext'
import TripSaved from './TripSaved'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
const oldTrip = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Earlier trip', destination_label: 'Lisbon, Portugal',
  start_date: '2027-03-27', end_date: '2027-03-30', version: 1, updated_at: '2026-11-23T12:00:00Z',
  timezone: 'Europe/Lisbon', traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD',
  interests: ['food'], free_text_constraints: null, status: 'draft', created_at: '2026-11-23T12:00:00Z',
}
const newTrip = { ...oldTrip, id: '00000000-0000-0000-0000-000000000002', title: 'Newly saved trip', updated_at: '2026-11-24T12:00:00Z' }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function list() { return within(screen.getByRole('region', { name: 'My Trips' })) }
function restore(persisted = true) { fireEvent(window, new PageTransitionEvent('pageshow', { persisted })) }
afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/')
})

test('merged creation flow leads to a freshly requested dashboard without resubmitting or prefetching', async () => {
  window.history.replaceState(null, '', '/#create-trip')
  vi.stubEnv('DEV', false)
  document.cookie = `roam_csrf=${'s'.repeat(43)}; Path=/`
  let trips = [oldTrip]
  const fetch = vi.fn((path: string, options: RequestInit) => {
    if (path === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (path === '/api/v1/trips' && options.method === 'POST') {
      trips = [newTrip, oldTrip]
      return Promise.resolve(Response.json(newTrip, { status: 201 }))
    }
    if (path === '/api/v1/trips?limit=20') return Promise.resolve(Response.json({ items: trips, next_cursor: null }))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<App />)
  await screen.findByRole('button', { name: 'Sign out' })
  for (const [label, value] of [
    ['Destination (required)', 'Lisbon, Portugal'], ['Destination time zone (required)', 'Europe/Lisbon'],
    ['Start date (required)', '2027-03-27'], ['End date (required)', '2027-03-30'],
    ['Number of travelers (required)', '2'], ['Budget per person (USD, required)', '750.50'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save trip' }))
  const confirmation = within(await screen.findByRole('region', { name: 'Trip saved' }))
  expect(confirmation.getByRole('link', { name: 'View saved trip' })).toHaveAttribute('href', `/trips/${newTrip.id}`)
  const target = confirmation.getByRole('link', { name: 'Go to My Trips' }).getAttribute('href')
  expect(target).toBe('/trips')
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/auth/me', '/api/v1/trips'])
  // Native anchors load a new document; explicitly reproduce that lifecycle.
  view.unmount()
  window.history.replaceState(null, '', target ?? '/')
  render(<App />)
  await list().findByRole('article', { name: newTrip.title })
  expect(list().getAllByRole('article').map((article) => within(article).getByRole('heading').textContent)).toEqual([newTrip.title, oldTrip.title])
  expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/trips?limit=20')).toHaveLength(1)
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
})

test('details Back to My Trips remounts a fresh first page and preserves API order', async () => {
  window.history.replaceState(null, '', `/trips/${oldTrip.id}`)
  vi.stubEnv('DEV', false)
  const fetch = vi.fn((path: string) => Promise.resolve(Response.json(path === '/api/auth/me' ? { user }
    : path === `/api/v1/trips/${oldTrip.id}` ? oldTrip : { items: [newTrip, oldTrip], next_cursor: null })))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  await screen.findByRole('heading', { name: oldTrip.title })
  fireEvent.click(screen.getByRole('link', { name: 'Back to My Trips' }))
  await list().findByRole('article', { name: newTrip.title })
  expect(list().getAllByRole('article').map((article) => within(article).getByRole('heading').textContent)).toEqual([newTrip.title, oldTrip.title])
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/auth/me', `/api/v1/trips/${oldTrip.id}`, '/api/v1/trips?limit=20'])
})

test('cached history restoration hides old data until session confirmation, then fetches once', async () => {
  const check = deferred<Response>()
  let checks = 0
  let reads = 0
  const fetch = vi.fn((path: string) => {
    if (path === '/api/auth/me') return ++checks === 1 ? Promise.resolve(Response.json({ user })) : check.promise
    return Promise.resolve(Response.json({ items: ++reads === 1 ? [oldTrip] : [newTrip, oldTrip], next_cursor: null }))
  })
  vi.stubGlobal('fetch', fetch)
  render(<AuthProvider><SavedTripsDashboard /></AuthProvider>)
  await list().findByRole('article', { name: oldTrip.title })
  restore(false)
  expect(fetch).toHaveBeenCalledTimes(2)
  restore(); restore()
  expect(list().queryByRole('article')).not.toBeInTheDocument()
  expect(list().getByRole('status')).toHaveTextContent('Checking sign-in')
  expect(reads).toBe(1)
  expect(checks).toBe(2)
  await act(async () => { check.resolve(Response.json({ user })) })
  await list().findByRole('article', { name: newTrip.title })
  expect(reads).toBe(2)
})

test('history restoration with an expired session discards cards and makes no protected read', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
    .mockResolvedValueOnce(Response.json({ items: [oldTrip], next_cursor: null }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  render(<AuthProvider><SavedTripsDashboard /></AuthProvider>)
  await list().findByRole('article', { name: oldTrip.title })
  restore()
  await list().findByText('Your session ended. Sign in again.')
  expect(list().queryByRole('article')).not.toBeInTheDocument()
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/auth/me', '/api/v1/trips?limit=20', '/api/auth/me'])
})

test('history restoration shares an already pending focus session check without a duplicate', async () => {
  const check = deferred<Response>()
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
    .mockResolvedValueOnce(Response.json({ items: [oldTrip], next_cursor: null }))
    .mockReturnValueOnce(check.promise)
    .mockResolvedValueOnce(Response.json({ items: [newTrip], next_cursor: null }))
  vi.stubGlobal('fetch', fetch)
  render(<AuthProvider><SavedTripsDashboard /></AuthProvider>)
  await list().findByRole('article', { name: oldTrip.title })
  fireEvent(window, new Event('focus'))
  restore()
  expect(list().queryByRole('article')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(3)
  await act(async () => { check.resolve(Response.json({ user })) })
  await list().findByRole('article', { name: newTrip.title })
  expect(fetch).toHaveBeenCalledTimes(4)
})

test('server cursors expose additional pages and refresh resets to first-page data', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [newTrip], next_cursor: 'next' }))
    .mockResolvedValueOnce(Response.json({ items: [oldTrip], next_cursor: null }))
    .mockResolvedValueOnce(Response.json({ items: [newTrip, oldTrip], next_cursor: 'next' }))
  vi.stubGlobal('fetch', fetch)
  render(<AuthContext value={{ state: { status: 'authenticated', user }, signingOut: false, retry: vi.fn(), signOut: vi.fn() }}><SavedTripsDashboard /></AuthContext>)
  fireEvent.click(await list().findByRole('button', { name: 'Next page' }))
  await list().findByRole('article', { name: oldTrip.title })
  expect(list().getByRole('button', { name: 'Previous page' })).toBeEnabled()
  fireEvent.click(list().getByRole('button', { name: 'Refresh trips' }))
  await list().findByRole('article', { name: newTrip.title })
  expect(list().queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
  expect(list().getByRole('button', { name: 'Next page' })).toBeEnabled()
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/v1/trips?limit=20', '/api/v1/trips?limit=20&cursor=next', '/api/v1/trips?limit=20'])
})

test('synchronous duplicate refresh actions trigger just one request', async () => {
  const pending = deferred<Response>()
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [], next_cursor: null })).mockReturnValueOnce(pending.promise)
  vi.stubGlobal('fetch', fetch)
  function Consumer() {
    const { state, refresh } = useSavedTrips()
    return <><p>{state.status}</p><button onClick={() => { refresh(); refresh() }}>Refresh twice</button></>
  }
  render(<Consumer />)
  await screen.findByText('success')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh twice' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  await act(async () => { pending.resolve(Response.json({ items: [], next_cursor: null })) })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('rapid next-page actions do not add duplicate cursors to previous-page history', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [newTrip], next_cursor: 'next' }))
    .mockResolvedValueOnce(Response.json({ items: [oldTrip], next_cursor: null }))
    .mockResolvedValueOnce(Response.json({ items: [newTrip], next_cursor: 'next' }))
  vi.stubGlobal('fetch', fetch)
  function Consumer() {
    const { state, nextPage, previousPage, hasPreviousPage } = useSavedTrips()
    return <><p>{state.status === 'success' ? state.page.items[0].title : state.status}</p>
      <button onClick={() => { nextPage(); nextPage() }}>Next twice</button>
      <button disabled={!hasPreviousPage} onClick={previousPage}>Previous</button></>
  }
  render(<Consumer />)
  await screen.findByText(newTrip.title)
  fireEvent.click(screen.getByRole('button', { name: 'Next twice' }))
  await screen.findByText(oldTrip.title)
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  await screen.findByText(newTrip.title)
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/v1/trips?limit=20', '/api/v1/trips?limit=20&cursor=next', '/api/v1/trips?limit=20'])
})

test('saved confirmation keeps an unknown budget distinct from a whole-trip amount', () => {
  render(<TripSaved trip={{ ...newTrip, budget_per_person_minor: null }} onCreateAnother={vi.fn()} />)
  expect(screen.getByText('Not specified')).toBeInTheDocument()
  expect(screen.queryByText('Not specified for the entire trip')).not.toBeInTheDocument()
})
