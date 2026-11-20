import { StrictMode, useLayoutEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../../App'
import * as auth from '../../api/auth'
import AuthProvider from './AuthProvider'
import AuthControls from './AuthControls'
import { useAuth } from './authContext'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'student@example.com', display_name: 'Student' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function account() { return within(screen.getByRole('region', { name: 'Account' })) }
function renderAuth() { return render(<AuthProvider><AuthControls /></AuthProvider>) }

beforeEach(() => { vi.stubEnv('DEV', false) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

test('loading is accessible and does not claim authentication', () => {
  vi.spyOn(auth, 'getCurrentUser').mockReturnValue(new Promise(() => {}))
  renderAuth()
  expect(account().getByRole('status')).toHaveTextContent('Checking sign-in…')
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('unauthenticated sign-in uses full-page login helper and warns about draft loss', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(null)
  const navigate = vi.spyOn(auth, 'startGoogleSignIn').mockImplementation(() => {})
  renderAuth()
  const button = await account().findByRole('button', { name: 'Sign in with Google' })
  expect(button).toHaveAccessibleDescription('Signing in leaves this page and clears unsaved trip details.')
  fireEvent.click(button)
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(account().getByRole('button', { name: 'Opening sign-in…' })).toBeDisabled()
})

test('a validated profile is rendered literally and email is the missing-name fallback', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue({ ...user, display_name: '<script>not markup</script>' })
  const { container, unmount } = renderAuth()
  await account().findByRole('button', { name: 'Sign out' })
  expect(account().getByRole('status')).toHaveTextContent('Signed in as <script>not markup</script>')
  expect(container.querySelector('script')).toBeNull()
  unmount()
  vi.mocked(auth.getCurrentUser).mockResolvedValue({ ...user, display_name: null })
  renderAuth()
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent(user.email))
})

test('compact account controls retain identity and automatic refresh without a manual session button', async () => {
  const check = vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  renderAuth()
  await account().findByRole('button', { name: 'Sign out' })
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
  expect(account().queryByRole('button', { name: 'Check session' })).not.toBeInTheDocument()
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
})

test('an unavailable backend shows recovery rather than signed-out success', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockRejectedValueOnce(new auth.AuthError('UNAVAILABLE')).mockResolvedValueOnce(user)
  renderAuth()
  expect(await account().findByRole('alert')).toHaveTextContent('Could not check your sign-in status')
  fireEvent.click(account().getByRole('button', { name: 'Retry sign-in check' }))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Signed in as Student'))
})

test('logout waits for server confirmation and prevents duplicate submits', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  const pending = deferred<'signed-out'>()
  const signOut = vi.spyOn(auth, 'logout').mockReturnValue(pending.promise)
  renderAuth()
  const button = await account().findByRole('button', { name: 'Sign out' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(account().getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(account().getByRole('status')).toHaveTextContent('Signed in as Student')
  await act(async () => { pending.resolve('signed-out') })
  expect(account().getByRole('status')).toHaveTextContent('Signed out.')
  expect(account().getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  expect(account().getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
})

test.each([
  ['success', false], ['outage', false], ['success', true], ['outage', true],
] as const)('immediate logout %s preserves recovery focus (Strict Mode: %s)', async (outcome, strict) => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  const pending = deferred<'signed-out'>()
  vi.spyOn(auth, 'logout').mockReturnValue(pending.promise.then((result) => {
    if (outcome === 'outage') throw new auth.AuthError('UNAVAILABLE')
    return result
  }))

  function ImmediateSignOut() {
    const { state } = useAuth()
    useLayoutEffect(() => {
      if (state.status === 'authenticated') {
        // Exercise an action before passive effects from this render run.
        account().getByRole('button', { name: 'Sign out' }).click()
      }
    }, [state.status])
    return <AuthControls />
  }

  const controls = <AuthProvider><ImmediateSignOut /></AuthProvider>
  render(strict ? <StrictMode>{controls}</StrictMode> : controls)
  await account().findByRole('button', { name: 'Signing out…' })
  await act(async () => { pending.resolve('signed-out') })
  const nextAction = outcome === 'outage' ? 'Retry sign-in check' : 'Sign in with Google'
  await waitFor(() => expect(account().getByRole('button', { name: nextAction })).toHaveFocus())
})

test('bootstrap and background expiry keep focus on trip editing', async () => {
  const initial = deferred<auth.AuthUser | null>()
  const refresh = deferred<auth.AuthUser | null>()
  vi.spyOn(auth, 'getCurrentUser').mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise)
  render(<AuthProvider><input aria-label="Trip notes" /><AuthControls /></AuthProvider>)
  const input = screen.getByRole('textbox', { name: 'Trip notes' })
  input.focus()
  await act(async () => { initial.resolve(user) })
  expect(account().getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(input).toHaveFocus()
  fireEvent(window, new Event('focus'))
  await act(async () => { refresh.resolve(null) })
  expect(account().getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  expect(input).toHaveFocus()
})

test.each(['UNAVAILABLE', 'CSRF_FAILED'] as const)('logout %s never invents success', async (code) => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  vi.spyOn(auth, 'logout').mockRejectedValue(new auth.AuthError(code))
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  expect(await account().findByRole('alert')).not.toHaveTextContent('Signed out.')
  expect(account().getByRole('button', { name: 'Retry sign-in check' })).toBeInTheDocument()
})

test('logout 401 is handled as an ended session', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  vi.spyOn(auth, 'logout').mockResolvedValue('session-ended')
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Your session ended. You are signed out.'))
})

test('missing or expired CSRF checks the server before treating the session as ended', async () => {
  const check = vi.spyOn(auth, 'getCurrentUser').mockResolvedValueOnce(user).mockResolvedValueOnce(null)
  vi.spyOn(auth, 'logout').mockRejectedValue(new auth.AuthError('CSRF_FAILED'))
  renderAuth()
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Your session ended. You are signed out.'))
  expect(check).toHaveBeenCalledTimes(2)
})

test.each(['focus', 'online', 'visibilitychange'])('%s rechecks detect session expiry', async (event) => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValueOnce(user).mockResolvedValueOnce(null)
  renderAuth()
  await account().findByRole('button', { name: 'Sign out' })
  fireEvent(event === 'visibilitychange' ? document : window, new Event(event))
  await waitFor(() => expect(account().getByRole('status')).toHaveTextContent('Your session ended. Sign in again.'))
})

test('a stale check cannot restore a user after logout', async () => {
  const pending = deferred<auth.AuthUser | null>()
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValueOnce(user).mockReturnValueOnce(pending.promise)
  vi.spyOn(auth, 'logout').mockResolvedValue('signed-out')
  renderAuth()
  await account().findByRole('button', { name: 'Sign out' })
  fireEvent(window, new Event('focus'))
  fireEvent.click(account().getByRole('button', { name: 'Sign out' }))
  await account().findByRole('button', { name: 'Sign in with Google' })
  await act(async () => { pending.resolve(user) })
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('Strict Mode cleanup aborts the old check and ignores its late result', async () => {
  const first = deferred<auth.AuthUser | null>()
  const check = vi.spyOn(auth, 'getCurrentUser').mockReturnValueOnce(first.promise).mockResolvedValueOnce(null)
  render(<StrictMode><AuthProvider><AuthControls /></AuthProvider></StrictMode>)
  await account().findByRole('button', { name: 'Sign in with Google' })
  expect(check.mock.calls[0][0]?.aborted).toBe(true)
  await act(async () => { first.resolve(user) })
  expect(account().queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('logout preserves editable trip fields and writes no browser storage', async () => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(user)
  vi.spyOn(auth, 'logout').mockResolvedValue('signed-out')
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<App />)
  fireEvent.change(screen.getByLabelText('Destination (required)'), { target: { value: 'Lisbon' } })
  fireEvent.click(await account().findByRole('button', { name: 'Sign out' }))
  await account().findByRole('button', { name: 'Sign in with Google' })
  expect(screen.getByLabelText('Destination (required)')).toHaveValue('Lisbon')
  expect(storage).not.toHaveBeenCalled()
})
