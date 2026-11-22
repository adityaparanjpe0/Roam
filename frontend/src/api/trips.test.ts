import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createTrip, TripApiError } from './trips'
import type { TripCreateRequest } from './trips'

const csrf = 'c'.repeat(43)
const requestId = '00000000-0000-0000-0000-000000000002'
const payload: TripCreateRequest = {
  destination_label: 'Lisbon, Portugal', timezone: 'Europe/Lisbon',
  start_date: '2027-03-27', end_date: '2027-03-30', traveler_count: 2,
  budget_per_person_minor: 75050, currency: 'USD', interests: ['food', 'culture'],
  free_text_constraints: null,
}
const saved = {
  ...payload, id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Lisbon, Portugal',
  status: 'draft', version: 1, created_at: '2026-11-21T12:00:00Z', updated_at: '2026-11-21T12:00:00Z',
}

beforeEach(() => { document.cookie = `roam_csrf=${csrf}; Path=/` })
afterEach(() => {
  document.cookie = 'roam_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks(); vi.useRealTimers()
})

test('posts the exact contract with same-origin cookies and CSRF, and copies only saved fields', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...saved, owner_id: 'PRIVATE_OWNER', token: 'PRIVATE_TOKEN' }, { status: 201 }))
  vi.stubGlobal('fetch', fetch)
  const input = { ...payload, owner_id: 'NOT_PROOF_OF_OWNERSHIP', version: 999 }
  const result = await createTrip(input)
  expect(result).toEqual(saved)
  expect(result.interests).not.toBe(saved.interests)
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/v1/trips', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(payload), signal: expect.any(AbortSignal),
  }))
})

test('supports optional title/constraints and valid Unicode and legacy-null response money', async () => {
  const title = '🌴'.repeat(120)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...saved, title, budget_per_person_minor: null }, { status: 201 })))
  const result = await createTrip({ ...payload, title, free_text_constraints: 'Quiet mornings' })
  expect(result.title).toBe(title)
  expect(result.budget_per_person_minor).toBeNull()
})

test.each(['', 'bad', 'x'.repeat(44)])('missing/malformed CSRF does not send a POST: %s', async (token) => {
  document.cookie = `roam_csrf=${token}; Path=/`
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'CSRF_FAILED', status: undefined })
  expect(fetch).not.toHaveBeenCalled()
})

test('ambiguous CSRF cookies are rejected before sending any trip data', async () => {
  vi.spyOn(document, 'cookie', 'get').mockReturnValue(`roam_csrf=${csrf}; roam_csrf=${csrf}`)
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'CSRF_FAILED' })
  expect(fetch).not.toHaveBeenCalled()
})

test.each([
  [401, 'AUTHENTICATION_REQUIRED'], [403, 'CSRF_FAILED'], [422, 'VALIDATION_FAILED'],
  [500, 'UNAVAILABLE'], [502, 'UNAVAILABLE'], [503, 'UNAVAILABLE'], [504, 'UNAVAILABLE'], [404, 'HTTP_ERROR'],
])('handles HTTP %i even when a proxy sends HTML instead of JSON', async (status, code) => {
  const fetch = vi.fn().mockResolvedValue(new Response('PRIVATE_HTML', { status: Number(status) }))
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload)).rejects.toMatchObject({ code, status })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('validation errors expose only allowlisted field messages and a validated request ID', async () => {
  const server = { error: {
    code: 'VALIDATION_FAILED', message: 'PRIVATE_MESSAGE', request_id: requestId,
    details: { timezone: 'PRIVATE_VALUE', traveler_count: 'PRIVATE_VALUE', PRIVATE_KEY: 'PRIVATE_VALUE', title: 123 },
  } }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(server, { status: 422 })))
  const error: unknown = await createTrip(payload).catch((failure: unknown) => failure)
  expect(error).toBeInstanceOf(TripApiError)
  expect(error).toMatchObject({ code: 'VALIDATION_FAILED', requestId, fieldErrors: {
    timezone: 'Choose a supported destination time zone.', traveler_count: 'Enter a whole number of travelers from 1 to 20.',
  } })
  expect(String(error) + JSON.stringify(error)).not.toContain('PRIVATE')
})

test.each(['DATABASE_UNAVAILABLE', 'AUTH_NOT_CONFIGURED'])('preserves known 503 code %s without exposing raw messages', async (code) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {
    code, message: 'PRIVATE_SQL', details: {}, request_id: requestId,
  } }, { status: 503 })))
  await expect(createTrip(payload)).rejects.toMatchObject({ code, status: 503, requestId })
})

test.each([
  { error: { code: 'VALIDATION_FAILED', details: { timezone: 'PRIVATE' }, request_id: requestId } },
  { error: { code: 'UNKNOWN', message: 'PRIVATE' } },
  { error: null }, [], null,
])('malformed or mismatched server envelopes do not override HTTP status: %#', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 503 })))
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'UNAVAILABLE', fieldErrors: {}, requestId: undefined })
})

test('unsafe request IDs and malformed error JSON are never reflected', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: { code: 'CSRF_FAILED', request_id: 'PRIVATE_INPUT' } }, { status: 403 }))
    .mockResolvedValueOnce(new Response('{PRIVATE_INPUT', { status: 422, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'CSRF_FAILED', requestId: undefined })
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: {} })
})

test.each([
  {}, [], null, { ...saved, id: 'not-a-uuid' }, { ...saved, title: null },
  { ...saved, destination_label: '' }, { ...saved, timezone: null },
  { ...saved, start_date: '2027-02-30' }, { ...saved, end_date: 123 },
  { ...saved, traveler_count: '2' }, { ...saved, traveler_count: true },
  { ...saved, budget_per_person_minor: 1.5 }, { ...saved, budget_per_person_minor: Number.MAX_SAFE_INTEGER + 1 },
  { ...saved, currency: null }, { ...saved, interests: [1] },
  { ...saved, free_text_constraints: {} }, { ...saved, version: 0 },
  { ...saved, status: null }, { ...saved, created_at: '2026-11-21' }, { ...saved, updated_at: 'not-a-date' },
  { ...saved, updated_at: '2026-11-21T24:00:00Z' },
])('rejects malformed 201 data instead of reporting a saved trip: %#', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 201 })))
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 201 })
})

test.each([200, 202, 204])('requires 201 rather than treating HTTP %i as saved', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'HTTP_ERROR', status })
})

test.each([
  new Response('<html>app fallback</html>', { status: 201 }),
  new Response('{PRIVATE', { status: 201, headers: { 'Content-Type': 'application/json' } }),
])('rejects non-JSON or broken JSON success responses', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

test('network failure is sanitized, describes uncertainty, and never retries POST', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('PRIVATE_PASSWORD'))
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('may have been saved') })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a pre-aborted caller never sends a POST', async () => {
  const controller = new AbortController()
  controller.abort()
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip(payload, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetch).not.toHaveBeenCalled()
})

function abortableFetch() {
  return vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
}

test('caller cancellation aborts fetch without reporting a network failure', async () => {
  const controller = new AbortController()
  const fetch = abortableFetch()
  vi.stubGlobal('fetch', fetch)
  const assertion = expect(createTrip(payload, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await assertion
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
})

test('timeout aborts the request after ten seconds and does not retry', async () => {
  vi.useFakeTimers()
  const fetch = abortableFetch()
  vi.stubGlobal('fetch', fetch)
  const assertion = expect(createTrip(payload)).rejects.toMatchObject({ code: 'TIMEOUT', message: expect.stringContaining('may have been saved') })
  await vi.advanceTimersByTimeAsync(10_000)
  await assertion
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('a successful request cleans up its timeout and cancellation listener', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(saved, { status: 201 })))
  await createTrip(payload, controller.signal)
  expect(vi.getTimerCount()).toBe(0)
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
})

test('timeout also bounds reading a response body after headers arrive', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn((_path: string, options: RequestInit) => {
    const response = Response.json(saved, { status: 201 })
    vi.spyOn(response, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    return Promise.resolve(response)
  })
  vi.stubGlobal('fetch', fetch)
  const assertion = expect(createTrip(payload)).rejects.toMatchObject({ code: 'TIMEOUT' })
  await vi.advanceTimersByTimeAsync(10_000)
  await assertion
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('a connection lost while reading a 201 body remains an uncertain network error', async () => {
  const response = Response.json(saved, { status: 201 })
  vi.spyOn(response, 'json').mockRejectedValue(new TypeError('PRIVATE_NETWORK_DETAILS'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(createTrip(payload)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
})
