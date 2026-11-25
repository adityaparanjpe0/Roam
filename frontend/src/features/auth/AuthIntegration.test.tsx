import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../../App'
import AuthProvider from './AuthProvider'
import AuthControls from './AuthControls'

// Real components/context/service; substitute only the HTTP boundary.
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'student@example.com', display_name: 'Student' }
const csrf = 's'.repeat(43)
function account() { return within(screen.getByRole('region', { name: 'Account' })) }
function renderAuth() { return render(<AuthProvider><AuthControls /></AuthProvider>) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers()
})

test('loading waits for a validated me response and copies no token-shaped extras', async () => {
  const pending = deferred<Response>()
  const fetch = vi.fn().mockReturnValue(pending.promise)
  vi.stubGlobal('fetch', fetch)
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  renderAuth()
  expect(screen.getByRole('region', { name: 'Account' })).toHaveAttribute('aria-busy', 'true')
  expect(account().getByRole('status')).toHaveTextContent('Checking sign-in')
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  await act(async () => { pending.resolve(Response.json({ user: { ...user, token: 'PRIVATE_TOKEN' }, csrf_token: 'PRIVATE_TOKEN' })) })
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
  expect(account().getByRole('button', { name: 'Sign out' })).toBeEnabled()
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/auth/me', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }))
  expect(screen.queryByText(/PRIVATE_TOKEN/)).not.toBeInTheDocument()
  expect(storage).not.toHaveBeenCalled()
})

test('a real 401 response renders unauthenticated controls', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  renderAuth()
  const button = await account().findByRole('button', { name: 'Sign in with Google' })
  expect(button).toHaveAccessibleDescription('Signing in leaves this page and clears unsaved trip details.')
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(account().queryByRole('alert')).not.toBeInTheDocument()
})

test('an expired session response replaces the last confirmed profile', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user })).mockResolvedValueOnce(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  renderAuth()
  await account().findByRole('button', { name: 'Sign out' })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Your session ended. Sign in again.'))
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('real logout sends the CSRF header, waits for 204, then preserves the trip form', async () => {
  vi.stubEnv('DEV', false)
  document.cookie = `roam_csrf=${csrf}; Path=/`
  const pending = deferred<Response>()
  const fetch = vi.fn((path: string) => {
    if (path === '/api/auth/me') return Promise.resolve(Response.json({ user }))
    if (path === '/api/v1/trips?limit=20') return Promise.resolve(Response.json({ items: [], next_cursor: null }))
    if (path === '/api/auth/logout') return pending.promise
    throw new Error('Unexpected fixture endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.change(screen.getByLabelText('Destination (required)'), { target: { value: 'Lisbon' } })
  const button = await account().findByRole('button', { name: 'Sign out' })
  fireEvent.click(button); fireEvent.click(button)
  expect(account().getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
  expect(fetch).toHaveBeenCalledTimes(2)
  // The creation page does not load dashboard data; still require one logout POST.
  expect(fetch.mock.calls.filter(([path]) => path === '/api/auth/logout')).toHaveLength(1)
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
  }))
  await act(async () => { pending.resolve(new Response(null, { status: 204 })) })
  expect(account().getByRole('status')).toHaveTextContent('Signed out.')
  expect(account().getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  expect(screen.getByLabelText('Destination (required)')).toHaveValue('Lisbon')
})

test('logout 401 confirms an ended session through the real service', async () => {
  document.cookie = `roam_csrf=${csrf}; Path=/`
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ user })).mockResolvedValueOnce(new Response(null, { status: 401 })))
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Your session ended. You are signed out.'))
})

test('logout outage exposes an accessible recoverable error, not success', async () => {
  document.cookie = `roam_csrf=${csrf}; Path=/`
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
    .mockResolvedValueOnce(Response.json({ error: { message: 'PRIVATE_DETAILS' } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ user }))
  vi.stubGlobal('fetch', fetch)
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  expect(await account().findByRole('alert')).toHaveTextContent('Could not confirm sign out')
  await waitFor(() => expect(account().getByRole('button', { name: 'Retry sign-in check' })).toHaveFocus())
  expect(screen.queryByText(/PRIVATE_DETAILS/)).not.toBeInTheDocument()
  fireEvent.click(account().getByRole('button', { name: 'Retry sign-in check' }))
  await waitFor(() => expect(account().getByRole('button', { name: 'Sign out' })).toHaveFocus())
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
})

test.each(['missing-cookie', 'rejected-header'])('CSRF %s checks me without inventing logout', async (scenario) => {
  if (scenario === 'rejected-header') document.cookie = `roam_csrf=${csrf}; Path=/`
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
  if (scenario === 'rejected-header') fetch.mockResolvedValueOnce(new Response(null, { status: 403 }))
  fetch.mockResolvedValueOnce(Response.json({ user }))
  vi.stubGlobal('fetch', fetch)
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  expect(await account().findByRole('alert')).toHaveTextContent('Request verification failed')
  expect(fetch).toHaveBeenCalledTimes(scenario === 'rejected-header' ? 3 : 2)
  expect(fetch).toHaveBeenLastCalledWith('/api/auth/me', expect.anything())
  expect(account().queryByText('Signed out.')).not.toBeInTheDocument()
})

test.each(['malformed', 'unavailable', 'network'])('bootstrap %s has safe, focused retry recovery', async (scenario) => {
  const fetch = vi.fn()
  if (scenario === 'network') fetch.mockRejectedValueOnce(new TypeError('PRIVATE_DETAILS'))
  else fetch.mockResolvedValueOnce(scenario === 'malformed'
    ? Response.json({ user: { ...user, id: 'not-a-uuid' } })
    : new Response('PRIVATE_DETAILS', { status: 503 }))
  fetch.mockResolvedValueOnce(Response.json({ user }))
  vi.stubGlobal('fetch', fetch)
  renderAuth()
  expect(await account().findByRole('alert')).toHaveTextContent('Could not check your sign-in status')
  expect(screen.queryByText(/PRIVATE_DETAILS/)).not.toBeInTheDocument()
  fireEvent.click(account().getByRole('button', { name: 'Retry sign-in check' }))
  // Recovery focus is applied by an effect after the button is rendered.
  await waitFor(() => expect(account().getByRole('button', { name: 'Sign out' })).toHaveFocus())
})

test('the HTTP timeout becomes an accessible timeout error and cancels fetch', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => {
    signal = options.signal
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
  }))
  renderAuth()
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(account().getByRole('alert')).toHaveTextContent('The sign-in check timed out. Try again.')
  expect(signal?.aborted).toBe(true)
  expect(account().getByRole('button', { name: 'Retry sign-in check' })).toBeEnabled()
})
