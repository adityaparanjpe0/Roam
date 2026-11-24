import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import * as authApi from '../../api/auth'
import AuthProvider from '../auth/AuthProvider'
import AuthControls from '../auth/AuthControls'
import { AuthContext } from '../auth/authContext'
import type { AuthState } from '../auth/authContext'
import TripCreation from './TripCreation'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
const csrf = 's'.repeat(43)
const saved = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Server title',
  destination_label: 'Lisbon, Portugal', timezone: 'Europe/Lisbon', start_date: '2027-03-27', end_date: '2027-03-30',
  traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD', interests: ['food', 'culture'], free_text_constraints: 'A relaxed pace',
  status: 'draft', version: 1, created_at: '2026-11-21T12:00:00Z', updated_at: '2026-11-21T12:00:00Z',
}

function deferred() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

function mockHttp(post: (options: RequestInit) => Response | Promise<Response>, initialUser: typeof user | null = user) {
  let currentUser = initialUser
  const fetch = vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path === '/api/auth/me') return currentUser ? Response.json({ user: currentUser }) : new Response(null, { status: 401 })
    if (path === '/api/auth/logout') { currentUser = null; return new Response(null, { status: 204 }) }
    if (path === '/api/v1/trips') return post(options)
    throw new Error('Unexpected fixture endpoint')
  })
  document.cookie = `roam_csrf=${csrf}; Path=/`
  vi.stubGlobal('fetch', fetch)
  return { fetch, setUser: (next: typeof user | null) => { currentUser = next },
    posts: () => fetch.mock.calls.filter(([path]) => path === '/api/v1/trips'),
  }
}

async function renderTrip() {
  const result = render(<StrictMode><AuthProvider><AuthControls /><TripCreation /></AuthProvider></StrictMode>)
  await screen.findByRole('button', { name: 'Sign out' })
  return result
}

function fillAndReview() {
  for (const [label, value] of [
    ['Destination (required)', ' Lisbon, Portugal '], ['Destination time zone (required)', ' Europe/Lisbon '],
    ['Start date (required)', '2027-03-27'], ['End date (required)', '2027-03-30'],
    ['Number of travelers (required)', '2'], ['Budget per person (USD, required)', '750.50'],
    ['Additional preferences or constraints (optional)', ' A relaxed pace '],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Art and culture' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
}

function review() { return within(screen.getByRole('region', { name: 'Review your trip' })) }

function postedOptions(http: ReturnType<typeof mockHttp>): RequestInit {
  const options = http.posts()[0]?.[1]
  if (!options) throw new Error('Expected trip POST options')
  return options
}

afterEach(() => {
  document.cookie = 'roam_csrf=; Path=/; Max-Age=0'
  vi.restoreAllMocks(); vi.useRealTimers()
})

test('review does not POST; explicit saving sends mapped cookies/CSRF and waits for validated canonical success', async () => {
  const pending = deferred()
  const http = mockHttp(() => pending.promise)
  await renderTrip()
  fillAndReview()
  expect(http.posts()).toHaveLength(0)
  const save = review().getByRole('button', { name: 'Save trip' })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(http.posts()).toHaveLength(1)
  expect(review().getByRole('button', { name: 'Saving trip…' })).toBeDisabled()
  expect(review().getByRole('button', { name: 'Edit details' })).toBeDisabled()
  expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument()
  const options = postedOptions(http)
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } })
  expect(JSON.parse(String(options.body))).toEqual({
    destination_label: 'Lisbon, Portugal', timezone: 'Europe/Lisbon', start_date: '2027-03-27', end_date: '2027-03-30',
    traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD', interests: ['food', 'culture'], free_text_constraints: 'A relaxed pace',
  })
  await act(async () => { pending.resolve(Response.json(saved, { status: 201 })) })
  expect(screen.getByRole('heading', { name: 'Trip saved' })).toHaveFocus()
  expect(screen.getByText('Server title')).toBeInTheDocument()
  expect(screen.getByText(saved.id)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save trip' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create another trip' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue('')
  expect(screen.getByLabelText('Destination time zone (required)')).toHaveValue('')
  expect(screen.getByLabelText('Destination (required)')).toHaveFocus()
  expect(http.posts()).toHaveLength(1)
})

test('frontend-invalid input never reaches the create endpoint', async () => {
  const http = mockHttp(() => Response.json(saved, { status: 201 }))
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Edit details' }))
  fireEvent.change(screen.getByLabelText('Destination time zone (required)'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByLabelText('Destination time zone (required)')).toHaveFocus()
  expect(screen.getByLabelText('Destination time zone (required)')).toHaveAttribute('aria-invalid', 'true')
  expect(http.posts()).toHaveLength(0)
})

test('server field rejection returns to original inputs with inline errors and focus, without exposing raw text', async () => {
  const http = mockHttp(() => Response.json({ error: { code: 'VALIDATION_FAILED', message: 'PRIVATE_MESSAGE',
    request_id: '00000000-0000-0000-0000-000000000002', details: { timezone: 'PRIVATE_VALUE', budget_per_person_minor: 'PRIVATE_VALUE' },
  } }, { status: 422 }))
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  const zone = await screen.findByLabelText('Destination time zone (required)')
  expect(zone).toHaveFocus()
  expect(zone).toHaveValue(' Europe/Lisbon ')
  expect(zone).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('Server validation:')
  expect(screen.getByLabelText('Destination (required)')).toHaveValue(' Lisbon, Portugal ')
  expect(screen.getByLabelText('Additional preferences or constraints (optional)')).toHaveValue(' A relaxed pace ')
  expect(screen.getByRole('checkbox', { name: 'Food' })).toBeChecked()
  expect(document.body.textContent).not.toContain('PRIVATE')
  fireEvent.change(zone, { target: { value: 'UTC' } })
  expect(zone).not.toHaveAttribute('aria-invalid')
  expect(screen.getByLabelText('Budget per person (USD, required)')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByLabelText('Budget per person (USD, required)')).toHaveFocus()
  expect(http.posts()).toHaveLength(1)
})

test.each([422, 500, 502, 503])('HTTP %i produces understandable feedback and preserves editable values', async (status) => {
  const http = mockHttp(() => new Response('PRIVATE_SERVER_OUTPUT', { status }))
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  const error = await review().findByRole('alert')
  expect(error).toHaveFocus()
  expect(error.textContent).not.toContain('PRIVATE')
  expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument()
  fireEvent.click(review().getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue(' Lisbon, Portugal ')
  expect(http.posts()).toHaveLength(1)
})

test.each(['network', 'invalid-response'])('%s has no false success and no automatic retry', async (failure) => {
  const http = mockHttp(() => {
    if (failure === 'network') return Promise.reject(new TypeError('PRIVATE_NETWORK'))
    return Response.json({}, { status: 201 })
  })
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  expect(await review().findByRole('alert')).toHaveTextContent('may have been saved')
  expect(document.body.textContent).not.toContain('PRIVATE')
  expect(http.posts()).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument()
})

test('an expired session refreshes the auth snapshot, blocks saving and preserves the draft', async () => {
  const http = mockHttp(() => { http.setUser(null); return new Response(null, { status: 401 }) })
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  await screen.findByRole('button', { name: 'Sign in with Google' })
  expect(review().getByRole('button', { name: 'Save trip' })).toBeDisabled()
  expect(review().getByRole('status')).toHaveTextContent('Sign in')
  fireEvent.click(review().getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue(' Lisbon, Portugal ')
  expect(http.posts()).toHaveLength(1)
})

test('CSRF failure offers existing Google navigation with a draft-loss warning and recovers a navigation failure', async () => {
  const navigate = vi.spyOn(authApi, 'startGoogleSignIn').mockImplementation(() => { throw new Error('PRIVATE_NAVIGATION') })
  const http = mockHttp(() => new Response(null, { status: 403 }))
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  const recovery = await review().findByRole('button', { name: 'Sign in again' })
  expect(review().getByText('Signing in again leaves this page and clears unsaved trip details.')).toBeInTheDocument()
  fireEvent.click(recovery)
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(review().getByText('Could not open sign-in. Try again.')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('PRIVATE_NAVIGATION')
  expect(http.posts()).toHaveLength(1)
})

test('missing CSRF prevents the POST instead of trusting the authenticated UI snapshot', async () => {
  const http = mockHttp(() => Response.json(saved, { status: 201 }))
  await renderTrip()
  fillAndReview()
  document.cookie = 'roam_csrf=; Path=/; Max-Age=0'
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  expect(await review().findByRole('alert')).toHaveTextContent('Request verification failed')
  expect(http.posts()).toHaveLength(0)
})

test.each(['logout', 'account-change'])('%s cancels an in-flight save and a late response cannot display old account data', async (change) => {
  const pending = deferred()
  const http = mockHttp(() => pending.promise)
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  const signal = postedOptions(http).signal
  if (change === 'logout') {
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign in with Google' })
  } else {
    http.setUser({ ...user, id: '00000000-0000-0000-0000-000000000002', display_name: 'Bob' })
    fireEvent(window, new Event('focus'))
    await screen.findByText('Bob')
  }
  // The account text commits before the old review's passive-effect cleanup.
  // Wait for cancellation itself before resolving the deliberately late POST.
  await waitFor(() => expect(signal?.aborted).toBe(true))
  await act(async () => { pending.resolve(Response.json(saved, { status: 201 })) })
  expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument()
  if (change === 'logout') {
    expect(review().getByRole('button', { name: 'Save trip' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  } else expect(review().getByRole('button', { name: 'Save trip' })).toBeEnabled()
})

test('changing accounts discards a saved confirmation without discarding editable inputs', async () => {
  const http = mockHttp(() => Response.json(saved, { status: 201 }))
  await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  await screen.findByRole('heading', { name: 'Trip saved' })
  http.setUser({ ...user, id: '00000000-0000-0000-0000-000000000002', display_name: 'Bob' })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument())
  expect(screen.queryByText('Server title')).not.toBeInTheDocument()
  fireEvent.click(review().getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue(' Lisbon, Portugal ')
})

test('unmounting aborts pending work, and a late result cannot restore the removed UI', async () => {
  const pending = deferred()
  const http = mockHttp(() => pending.promise)
  const view = await renderTrip()
  fillAndReview()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  const signal = postedOptions(http).signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => { pending.resolve(Response.json(saved, { status: 201 })) })
  expect(screen.queryByRole('heading', { name: 'Trip saved' })).not.toBeInTheDocument()
})

test('signed-out users can review and edit, but cannot send a save request', async () => {
  const http = mockHttp(() => Response.json(saved, { status: 201 }), null)
  render(<AuthProvider><AuthControls /><TripCreation /></AuthProvider>)
  await screen.findByRole('button', { name: 'Sign in with Google' })
  fillAndReview()
  const save = review().getByRole('button', { name: 'Save trip' })
  expect(save).toBeDisabled()
  fireEvent.click(save)
  expect(review().getByRole('status')).toHaveTextContent('Signing in clears unsaved details')
  expect(http.posts()).toHaveLength(0)
})

test('a timeout leaves review editable and warns that persistence is uncertain', async () => {
  const http = mockHttp((options) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  await renderTrip()
  fillAndReview()
  vi.useFakeTimers()
  fireEvent.click(review().getByRole('button', { name: 'Save trip' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(review().getByRole('alert')).toHaveTextContent('Saving timed out')
  expect(review().getByRole('alert')).toHaveTextContent('may have been saved')
  expect(review().getByRole('button', { name: 'Edit details' })).toBeEnabled()
  expect(http.posts()).toHaveLength(1)
})

test.each<AuthState>([{ status: 'loading' }, { status: 'error', message: 'Could not confirm sign-in.' }])('unknown auth ($status) does not authorize saving', (state) => {
  const http = mockHttp(() => Response.json(saved, { status: 201 }))
  render(<AuthContext value={{ state, signingOut: false, retry: vi.fn(), signOut: vi.fn() }}><TripCreation /></AuthContext>)
  fillAndReview()
  expect(review().getByRole('button', { name: 'Save trip' })).toBeDisabled()
  expect(http.posts()).toHaveLength(0)
})
