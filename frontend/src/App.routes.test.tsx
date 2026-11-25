import { render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
const trip = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Lisbon spring break', destination_label: 'Lisbon, Portugal',
  start_date: '2027-03-27', end_date: '2027-03-30', version: 1, updated_at: '2026-11-24T12:00:00Z',
}

function open(path: string, authenticated = true) {
  window.history.replaceState(null, '', path)
  vi.stubEnv('DEV', false)
  const fetch = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(authenticated ? Response.json({ user }) : new Response(null, { status: 401 }))
    if (url === '/api/v1/trips?limit=20') return Promise.resolve(Response.json({ items: [trip], next_cursor: null }))
    if (url === `/api/v1/trips/${trip.id}`) return Promise.resolve(Response.json({ ...trip, timezone: 'Europe/Lisbon', traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD', interests: ['food'], free_text_constraints: null, status: 'draft', created_at: trip.updated_at }))
    throw new Error('Unexpected request')
  })
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  return fetch
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

test('direct dashboard entry has one primary heading, an accurate page count and real-ID navigation', async () => {
  const fetch = open('/trips')
  const main = screen.getByRole('main')
  expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'My Trips', level: 1 })).toHaveFocus()
  expect(await within(main).findByRole('status')).toHaveTextContent(/Checking|Loading|saved/)
  const card = await within(main).findByRole('article', { name: trip.title })
  expect(within(main).getByRole('status')).toHaveTextContent('1 saved trip on this page.')
  expect(within(card).getByRole('link', { name: `View Trip: ${trip.title}` })).toHaveAttribute('href', `/trips/${trip.id}`)
  expect(within(main).getByRole('link', { name: 'Plan a New Trip' })).toHaveAttribute('href', '/#create-trip')
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'My Trips' })).toHaveAttribute('aria-current', 'page')
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('old My Trips anchor bookmarks redirect to the standalone page', async () => {
  open('/#my-trips')
  await screen.findByRole('article', { name: trip.title })
  expect(window.location.pathname).toBe('/trips')
  expect(window.location.hash).toBe('')
})

test('direct trip navigation independently retrieves canonical saved details', async () => {
  const fetch = open(`/trips/${trip.id}`)
  expect(await screen.findByRole('heading', { name: trip.title })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Trip details', level: 1 })).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Back to My Trips' })).toHaveAttribute('href', '/trips')
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', `/api/v1/trips/${trip.id}`])
})

test('a guest dashboard sends no protected request and still links to the creation form', async () => {
  const fetch = open('/trips', false)
  await screen.findByText('Sign in to see your saved trips.')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Plan a New Trip' })).toHaveAttribute('href', '/#create-trip')
})

test('cross-page header links reach the existing home sections', () => {
  open('/trips')
  const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  expect(navigation.getByRole('link', { name: 'Trip details' })).toHaveAttribute('href', '/#create-trip')
  expect(navigation.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/#about')
  expect(screen.getByRole('link', { name: 'Roam home' })).toHaveAttribute('href', '/#top')
})

test('unknown frontend URLs show a recoverable page-not-found view', () => {
  open('/missing-page')
  expect(screen.getByRole('heading', { name: 'Page not found', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to My Trips' })).toHaveAttribute('href', '/trips')
})

test('cross-page creation links focus the existing form after React mounts its anchor', () => {
  open('/#create-trip')
  expect(screen.getByRole('form', { name: 'Trip details' })).toBeInTheDocument()
  expect(screen.getByLabelText('Destination (required)')).toHaveFocus()
})
