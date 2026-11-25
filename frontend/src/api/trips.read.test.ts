import { afterEach, expect, test, vi } from 'vitest'
import { getTrip, listTrips, TripApiError } from './trips'
import type { TripListOptions, TripResponse, TripSummary } from './trips'

const requestId = '00000000-0000-0000-0000-000000000002'
const summary: TripSummary = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Lisbon spring break',
  destination_label: 'Lisbon, Portugal', start_date: '2027-03-27', end_date: '2027-03-30',
  version: 2, updated_at: '2026-11-22T14:00:00.123456Z',
}
const saved: TripResponse = {
  ...summary, timezone: 'Europe/Lisbon', traveler_count: 2, budget_per_person_minor: 75050,
  currency: 'USD', interests: ['food', 'culture'], free_text_constraints: null,
  status: 'draft', created_at: '2026-11-21T12:00:00Z',
}
const page = { items: [summary], next_cursor: null }
const nextCursor = btoa(JSON.stringify({ v: 1, updated_at: summary.updated_at, id: summary.id }))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const reads: { name: string; request: (signal?: AbortSignal) => Promise<unknown>; body: unknown }[] = [
  { name: 'list', request: (signal) => listTrips({}, signal), body: page },
  { name: 'detail', request: (signal) => getTrip(summary.id, signal), body: saved },
]

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

test('lists one page with same-origin session credentials and no CSRF, body, or owner parameter', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...page, owner_id: 'PRIVATE', token: 'PRIVATE' }))
  vi.stubGlobal('fetch', fetch)
  // Reads must not depend on the readable CSRF cookie or inspect bearer cookies.
  const cookie = vi.spyOn(document, 'cookie', 'get').mockImplementation(() => { throw new Error('Must not read cookies') })
  expect(await listTrips()).toEqual(page)
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/v1/trips', {
    method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin',
    cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal),
  })
  expect(cookie).not.toHaveBeenCalled()
})

test('passes the opaque next cursor unchanged and allowlists pagination arguments', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [summary], next_cursor: nextCursor })))
  vi.stubGlobal('fetch', fetch)
  const first = await listTrips({ limit: 1 })
  const options = { limit: 1, cursor: first.next_cursor, owner_id: 'PRIVATE', user_id: 'PRIVATE' }
  await listTrips(options)
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/api/v1/trips?limit=1', `/api/v1/trips?limit=1&cursor=${encodeURIComponent(nextCursor)}`,
  ])
})

test('accepts the maximum limit and null cursor as a first-page request', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ items: [], next_cursor: null }))
  vi.stubGlobal('fetch', fetch)
  expect(await listTrips({ limit: 100, cursor: null })).toEqual({ items: [], next_cursor: null })
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/trips?limit=100')
})

test.each<TripListOptions>([
  { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN }, { limit: Infinity },
  { cursor: '' }, { cursor: 'x'.repeat(513) }, { cursor: '../trips?owner_id=PRIVATE' },
])('rejects invalid pagination before making a request: %j', async (options) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(listTrips(options)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: undefined })
  expect(fetch).not.toHaveBeenCalled()
})

test('copies compact summaries only and preserves server ordering and stable IDs', async () => {
  const second = { ...summary, id: requestId }
  const input = { items: [{ ...summary, budget_per_person_minor: 75050, owner_id: 'PRIVATE' }, second], next_cursor: null }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(input)))
  const result = await listTrips()
  expect(result).toEqual({ items: [summary, second], next_cursor: null })
  expect(result.items[0]).not.toBe(input.items[0])
})

test('retrieves canonical metadata with the existing relative trip URL and no CSRF', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...saved, owner_id: 'PRIVATE', days: [], token: 'PRIVATE' }))
  vi.stubGlobal('fetch', fetch)
  const result = await getTrip(summary.id)
  expect(result).toEqual(saved)
  expect(result.interests).not.toBe(saved.interests)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/trips/${summary.id}`, {
    method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin',
    cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal),
  })
})

test.each(['', 'not-a-uuid', '../auth/me', `${summary.id}?owner_id=PRIVATE`, 'https://other.example/trip'])('rejects unsafe or invalid trip IDs: %s', async (id) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(getTrip(id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: undefined })
  expect(fetch).not.toHaveBeenCalled()
})

test.each([null, 0, 75050])('preserves nullable/integer minor-unit money and calendar dates: %s', async (budget) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...saved, budget_per_person_minor: budget })))
  const result = await getTrip(summary.id)
  expect(result.budget_per_person_minor).toBe(budget)
  expect(result.free_text_constraints).toBeNull()
  expect(result.start_date).toBe('2027-03-27')
  expect(result.updated_at).toBe(summary.updated_at)
})

test('keeps response strings independent of the narrower create-request vocabulary', async () => {
  const response = { ...saved, title: '🌴'.repeat(120), interests: ['legacy-interest'], currency: 'EUR', free_text_constraints: 'Quiet mornings' }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)))
  expect(await getTrip(summary.id)).toEqual(response)
})

test.each([
  null, [], {}, { items: [], next_cursor: undefined }, { items: null, next_cursor: null },
  { items: [], next_cursor: 1 }, { items: [], next_cursor: '' },
  { items: [], next_cursor: 'x'.repeat(513) }, { items: [], next_cursor: 'bad?cursor' },
  { items: Array.from({ length: 101 }, () => summary), next_cursor: null },
  ...[
    null, {}, { ...summary, id: 'bad' }, { ...summary, title: null },
    { ...summary, start_date: '2027-02-30' }, { ...summary, end_date: '2027-03-30T00:00:00Z' },
    { ...summary, version: 0 }, { ...summary, version: 1.5 }, { ...summary, updated_at: '2026-11-22' },
  ].map((item) => ({ items: [item], next_cursor: null })),
])('rejects malformed list envelopes or summaries instead of inventing data: %#', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  await expect(listTrips()).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
})

test.each([
  { ...saved, budget_per_person_minor: undefined }, { ...saved, free_text_constraints: undefined },
  { ...saved, budget_per_person_minor: '75050' }, { ...saved, budget_per_person_minor: 1.5 },
  { ...saved, budget_per_person_minor: Number.MAX_SAFE_INTEGER + 1 },
  { ...saved, traveler_count: true }, { ...saved, interests: [1] }, { ...saved, status: null },
  { ...saved, timezone: undefined }, { ...saved, created_at: 'bad' },
])('rejects malformed detail fields, including omitted nullable keys: %#', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  await expect(getTrip(summary.id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
})

test.each(reads)('$name requires HTTP 200 and validates JSON content and syntax', async ({ request }) => {
  for (const response of [
    new Response(null, { status: 201 }), new Response(null, { status: 204 }),
    new Response('<html>PRIVATE fallback</html>'),
    new Response('{PRIVATE', { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const error: unknown = await request().catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(TripApiError)
    expect(String(error)).not.toContain('PRIVATE')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(error).toMatchObject({ code: response.status === 200 ? 'INVALID_RESPONSE' : 'HTTP_ERROR', status: response.status })
  }
})

test.each(reads)('$name maps read errors without save messages or raw server details', async ({ request }) => {
  for (const [status, code] of [
    [401, 'AUTHENTICATION_REQUIRED'], [403, 'FORBIDDEN'], [404, 'RESOURCE_NOT_FOUND'],
    [422, 'VALIDATION_FAILED'], [500, 'UNAVAILABLE'], [502, 'UNAVAILABLE'],
    [503, 'DATABASE_UNAVAILABLE'],
  ] as const) {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: {
      code, request_id: requestId, message: 'PRIVATE SQL', details: { cursor: 'PRIVATE', title: 'PRIVATE' },
    } }, { status }))
    vi.stubGlobal('fetch', fetch)
    const error: unknown = await request().catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(TripApiError)
    expect(error).toMatchObject({ code, status, requestId, fieldErrors: {} })
    expect(String(error) + JSON.stringify(error)).not.toMatch(/PRIVATE|may have been saved|Saving was not confirmed/)
    expect(fetch).toHaveBeenCalledTimes(1)
  }
})

test.each(reads)('$name preserves status for non-JSON proxy errors and ignores unsafe envelopes', async ({ request }) => {
  for (const [response, expected] of [
    [new Response('PRIVATE', { status: 401 }), { code: 'AUTHENTICATION_REQUIRED', status: 401 }],
    [Response.json({ error: { code: 'AUTH_NOT_CONFIGURED', request_id: requestId } }, { status: 503 }), { code: 'AUTH_NOT_CONFIGURED', requestId }],
    [Response.json({ error: { code: 'RESOURCE_NOT_FOUND', request_id: 'PRIVATE' } }, { status: 404 }), { code: 'RESOURCE_NOT_FOUND', requestId: undefined }],
    [Response.json({ error: { code: 'AUTHENTICATION_REQUIRED', request_id: requestId } }, { status: 503 }), { code: 'UNAVAILABLE', requestId: undefined }],
  ] as const) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(request()).rejects.toMatchObject(expected)
  }
})

test.each(reads)('$name sanitizes network errors without retrying or implying a save', async ({ request }) => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('PRIVATE'))
  vi.stubGlobal('fetch', fetch)
  await expect(request()).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: 'Could not load trips. Check your connection and try again.' })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each(reads)('$name treats a legacy CSRF-labelled 403 as a read denial without exposing its details', async ({ request }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {
    code: 'CSRF_FAILED', message: 'PRIVATE_SERVER_MESSAGE', request_id: requestId, details: { token: 'PRIVATE' },
  } }, { status: 403 })))
  const error: unknown = await request().catch((failure: unknown) => failure)
  expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403, fieldErrors: {} })
  expect(String(error) + JSON.stringify(error)).not.toContain('PRIVATE')
})

test.each(reads)('$name skips a pre-aborted request', async ({ request }) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  controller.abort()
  await expect(request(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetch).not.toHaveBeenCalled()
})

function abortableFetch(body?: unknown) {
  return vi.fn((_path: string, options: RequestInit) => {
    const pending = () => new Promise<never>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    if (body === undefined) return pending()
    const response = Response.json(body)
    vi.spyOn(response, 'json').mockImplementation(pending)
    return Promise.resolve(response)
  })
}

test.each(reads)('$name forwards cancellation during body reading and removes timers/listeners', async ({ request, body }) => {
  vi.useFakeTimers()
  const fetch = abortableFetch(body)
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  const assertion = expect(request(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  await assertion
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
})

test.each(reads)('$name bounds both fetch and body reading to ten seconds without retry', async ({ request, body }) => {
  vi.useFakeTimers()
  for (const responseBody of [undefined, body]) {
    const fetch = abortableFetch(responseBody)
    vi.stubGlobal('fetch', fetch)
    const assertion = expect(request()).rejects.toMatchObject({ code: 'TIMEOUT', message: 'Loading trips timed out. Try again.' })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  }
})

test.each(reads)('$name cleans up after success and reports a body connection failure safely', async ({ request, body }) => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  await request(controller.signal)
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
  const response = Response.json(body)
  vi.spyOn(response, 'json').mockRejectedValue(new TypeError('PRIVATE'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(request()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  expect(vi.getTimerCount()).toBe(0)
})
