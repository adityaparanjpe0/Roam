/** Backend-managed cookie authentication. Never read/store the bearer cookie. */
export interface AuthUser {
  id: string
  email: string
  display_name: string | null
}

export type AuthErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'CSRF_FAILED' | 'UNAVAILABLE' | 'HTTP_ERROR'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
    this.code = code
  }
}

export const GOOGLE_LOGIN_PATH = '/auth/google/start'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function userProfile(value: unknown): value is AuthUser {
  return record(value)
    && typeof value.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
    && typeof value.email === 'string' && value.email.trim().length > 0 && Array.from(value.email).length <= 254
    && (value.display_name === null || (typeof value.display_name === 'string' && Array.from(value.display_name).length <= 120))
}

async function json(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new AuthError('INVALID_RESPONSE')
  try {
    const data: unknown = await response.json()
    return data
  } catch {
    throw new AuthError('INVALID_RESPONSE')
  }
}

async function authRequest<T>(
  path: string,
  options: RequestInit,
  read: (response: Response) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 10_000)
  const cancel = () => { clearTimeout(timeout); controller.abort() }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const response = await fetch(path, {
      ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    })
    const result = await read(response)
    controller.signal.throwIfAborted()
    return result
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (timedOut) throw new AuthError('TIMEOUT')
    if (error instanceof AuthError) throw error
    throw new AuthError('NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export function getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  return authRequest('/api/auth/me', { headers: { Accept: 'application/json' } }, async (response) => {
    if (response.status === 401) return null
    if (response.status >= 500) throw new AuthError('UNAVAILABLE')
    if (response.status !== 200) throw new AuthError('HTTP_ERROR')
    const data = await json(response)
    if (!record(data) || !userProfile(data.user)) throw new AuthError('INVALID_RESPONSE')
    // Explicitly copy only the documented profile; no token-shaped extras enter state.
    return { id: data.user.id, email: data.user.email, display_name: data.user.display_name }
  }, signal)
}

/** Read only the CSRF delivery cookie, never the HttpOnly session bearer. */
export function csrfCookie(): string {
  const name = window.location.protocol === 'https:' ? '__Host-roam_csrf' : 'roam_csrf'
  const matches = document.cookie.split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='))
  if (matches.length !== 1) throw new AuthError('CSRF_FAILED')
  const value = matches[0].slice(name.length + 1)
  if (!TOKEN_PATTERN.test(value)) throw new AuthError('CSRF_FAILED')
  return value
}

export function logout(signal?: AbortSignal): Promise<'signed-out' | 'session-ended'> {
  const csrf = csrfCookie()
  return authRequest('/api/auth/logout', {
    method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
  }, async (response) => {
    if (response.status === 204) return 'signed-out'
    if (response.status === 401) return 'session-ended'
    if (response.status === 403) throw new AuthError('CSRF_FAILED')
    if (response.status >= 500) throw new AuthError('UNAVAILABLE')
    throw new AuthError('HTTP_ERROR')
  }, signal)
}

export function startGoogleSignIn(): void {
  window.location.assign(GOOGLE_LOGIN_PATH)
}
