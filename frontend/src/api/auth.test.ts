import { afterEach, expect, test, vi } from 'vitest'
import { AuthError, getCurrentUser, logout } from './auth'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'student@example.com', display_name: 'Student' }
const csrf = 'c'.repeat(43)

afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('me uses relative same-origin cookies and returns only validated profile fields', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ user: { ...user, token: 'do-not-copy' }, csrf_token: 'do-not-copy' }))
  vi.stubGlobal('fetch', fetch)
  expect(await getCurrentUser()).toEqual(user)
  expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }))
})

test('401 means unauthenticated without assuming an error body shape', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  expect(await getCurrentUser()).toBeNull()
})

test.each([
  {}, [], { user: null }, { user: { ...user, id: 'not-a-uuid' } },
  { user: { ...user, email: '' } }, { user: { ...user, display_name: 1 } },
  { user: { ...user, display_name: 'x'.repeat(121) } },
])('rejects malformed successful response %#', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  await expect(getCurrentUser()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

test('profile lengths follow backend Unicode code points', async () => {
  const unicode = { ...user, display_name: '🌴'.repeat(120) }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user: unicode })))
  expect(await getCurrentUser()).toEqual(unicode)
})

test.each([new Response('<html>app fallback</html>'), new Response('{broken', { headers: { 'Content-Type': 'application/json' } })])('rejects HTML fallback and invalid JSON', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(getCurrentUser()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

test.each([403, 404, 500, 503])('HTTP %i does not pretend to be signed out', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
  await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthError)
})

test('network failure stays an error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('SENSITIVE')))
  await expect(getCurrentUser()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
})

test('logout reads only the CSRF cookie and posts its value as a header', async () => {
  document.cookie = `roam_csrf=${csrf}; Path=/`
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  expect(await logout()).toBe('signed-out')
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
  }))
})

test.each([401, 403, 503])('logout handles %i without invented success', async (status) => {
  document.cookie = `roam_csrf=${csrf}; Path=/`
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
  if (status === 401) expect(await logout()).toBe('session-ended')
  else await expect(logout()).rejects.toMatchObject({ code: status === 403 ? 'CSRF_FAILED' : 'UNAVAILABLE' })
})

test.each(['', 'bad', 'x'.repeat(44)])('missing or malformed CSRF never sends a request: %s', (value) => {
  document.cookie = `roam_csrf=${value}; Path=/`
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(() => logout()).toThrow(AuthError)
  expect(fetch).not.toHaveBeenCalled()
})

test('caller cancellation is distinguished from network failure', async () => {
  const controller = new AbortController()
  vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  const pending = getCurrentUser(controller.signal)
  const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await assertion
})

test('requests time out and cancel the underlying fetch', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  const assertion = expect(getCurrentUser()).rejects.toMatchObject({ code: 'TIMEOUT' })
  await vi.advanceTimersByTimeAsync(10_000)
  await assertion
})
