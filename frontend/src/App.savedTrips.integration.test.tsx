import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { authUser, savedTrip } from './test/tripFixtures'
import { deferred } from './test/deferred'

const user = authUser()
const trip = savedTrip()
const path = `/api/v1/trips/${trip.id}`
function enter(url = `/trips/${trip.id}`) {
  window.history.replaceState(null, '', url)
  vi.stubEnv('DEV', false)
  return render(<App />)
}
function main() { return within(screen.getByRole('main')) }
afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/')
})

test('the card URL independently loads canonical details and creation navigation reaches the real form', async () => {
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === '/api/v1/trips?limit=20') return Promise.resolve(Response.json({ items: [trip], next_cursor: null }))
    if (url === path) return Promise.resolve(Response.json({ ...trip, title: 'Canonical detail title' }))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  const dashboard = enter('/trips')
  const card = await main().findByRole('article', { name: trip.title })
  const detailUrl = within(card).getByRole('link', { name: `View Trip: ${trip.title}` }).getAttribute('href')
  expect(detailUrl).toBe(`/trips/${trip.id}`)
  // Native anchors create another document: no dashboard snapshot is supplied.
  dashboard.unmount()
  const details = enter(detailUrl ?? '/')
  expect(await main().findByRole('heading', { name: 'Canonical detail title' })).toBeInTheDocument()
  expect(main().queryByText(trip.title)).not.toBeInTheDocument()
  fireEvent.click(main().getByRole('link', { name: 'Back to My Trips' }))
  await main().findByRole('article', { name: trip.title })
  const createUrl = main().getByRole('link', { name: 'Plan a New Trip' }).getAttribute('href')
  expect(createUrl).toBe('/#create-trip')
  details.unmount()
  enter(createUrl ?? '/')
  expect(main().getByRole('form', { name: 'Trip details' })).toBeInTheDocument()
  expect(screen.getByLabelText('Destination (required)')).toHaveFocus()
  expect(fetch.mock.calls.filter(([url]) => url === path)).toHaveLength(1)
  expect(fetch.mock.calls.filter(([url]) => url.startsWith('/api/v1/trips'))).toHaveLength(3)
})

test('direct detail entry waits for real auth confirmation and then announces request loading', async () => {
  const account = deferred<Response>()
  const detail = deferred<Response>()
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return account.promise
    if (url === path) return detail.promise
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  enter()
  expect(main().getByRole('status')).toHaveTextContent('Checking sign-in')
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { account.resolve(Response.json({ user })) })
  expect(main().getByRole('status')).toHaveTextContent('Loading trip details')
  expect(main().queryByText(trip.title)).not.toBeInTheDocument()
  await act(async () => { detail.resolve(Response.json(trip)) })
  expect(main().getByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('detail 401 recovery checks the real auth endpoint and shows the established expiry notice', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
    .mockResolvedValueOnce(new Response('PRIVATE_SESSION_ERROR', { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  enter()
  fireEvent.click(await main().findByRole('button', { name: 'Recheck sign-in' }))
  expect(await main().findByRole('heading', { name: 'Sign in to view this trip' })).toBeInTheDocument()
  expect(main().getByText('Your session ended. Sign in again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  expect(main().queryByText(trip.title)).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE')
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', path, '/api/auth/me'])
})

test('a valid account check does not bypass repeated detail denial or log the user out', async () => {
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === path) return Promise.resolve(new Response('PRIVATE_DENIAL', { status: 403 }))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  enter()
  fireEvent.click(await main().findByRole('button', { name: 'Check account' }))
  expect(await main().findByRole('alert')).toHaveTextContent('not permitted')
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  expect(main().queryByText(trip.title)).not.toBeInTheDocument()
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', path, '/api/auth/me', path])
})

test('real logout clears already rendered details while waiting for confirmation', async () => {
  const logout = deferred<Response>()
  document.cookie = `roam_csrf=${'s'.repeat(43)}; Path=/`
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === path) return Promise.resolve(Response.json(trip))
    if (url === '/api/auth/logout') return logout.promise
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  enter()
  await main().findByRole('heading', { name: trip.title })
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(main().queryByText(trip.title)).not.toBeInTheDocument()
  expect(main().getByRole('status')).toHaveTextContent('Trip details are hidden')
  await act(async () => { logout.resolve(new Response(null, { status: 204 })) })
  expect(main().getByRole('heading', { name: 'Sign in to view this trip' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', path, '/api/auth/logout'])
})

test.each(['draft', 'ready', 'archived'])('status %s never fabricates an empty or generated itinerary', async (status) => {
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === path) return Promise.resolve(Response.json(savedTrip({ status })))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  enter()
  const itinerary = await main().findByRole('region', { name: 'Itinerary' })
  expect(itinerary).toHaveTextContent('without itinerary activities or confirmation of whether an itinerary has been generated')
  expect(within(itinerary).queryByRole('list')).not.toBeInTheDocument()
  expect(main().queryByRole('button', { name: /generate|edit|export|delete/i })).not.toBeInTheDocument()
  expect(main().queryByText(/no itinerary has been generated/i)).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('saved preferences remain literal text rather than executable markup', async () => {
  const text = '<img src=x onerror=alert(1)>'
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (url === path) return Promise.resolve(Response.json(savedTrip({ title: text, destination_label: text, interests: [text], free_text_constraints: text })))
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  const view = enter()
  expect(await main().findByRole('heading', { name: text })).toBeInTheDocument()
  expect(within(main().getByRole('list', { name: 'Saved interests' })).getByText(text)).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
})
