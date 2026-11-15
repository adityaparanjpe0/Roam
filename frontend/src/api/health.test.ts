import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getHealth, HealthCheckError } from './health'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('requests the existing same-origin health endpoint and validates its JSON', async () => {
  const controller = new AbortController()
  fetchMock.mockResolvedValueOnce(new Response('{"status":"ok","extra":"ignored"}', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }))

  await expect(getHealth(controller.signal)).resolves.toEqual({ status: 'ok' })
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/health', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  })
})

test.each([404, 503])('reports HTTP %i without exposing the response body', async (status) => {
  fetchMock.mockResolvedValueOnce(new Response('private upstream details', { status }))

  await expect(getHealth()).rejects.toMatchObject({
    name: 'HealthCheckError',
    code: 'HTTP_ERROR',
    status,
    message: 'The backend returned an HTTP error.',
  })
})

test('reports a rejected fetch as a network failure', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('internal connection details'))

  await expect(getHealth()).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'Could not reach the backend.',
  })
})

test('rejects an HTML response even when its status is successful', async () => {
  fetchMock.mockResolvedValueOnce(new Response('<html>Vite fallback</html>', {
    headers: { 'Content-Type': 'text/html' },
  }))

  await expect(getHealth()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

test('rejects malformed JSON', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{broken', {
    headers: { 'Content-Type': 'application/json' },
  }))

  await expect(getHealth()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

test.each([null, [], {}, { status: 'down' }, 'ok', { status: true }])(
  'rejects an unexpected JSON shape: %j', async (data) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    }))

    const request = getHealth()
    await expect(request).rejects.toBeInstanceOf(HealthCheckError)
    await expect(request).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  },
)

test('does not start a request when its signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()

  await expect(getHealth(controller.signal)).rejects.toBe(controller.signal.reason)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('preserves cancellation during fetch instead of reporting a network failure', async () => {
  const controller = new AbortController()
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
  }))

  const request = getHealth(controller.signal)
  controller.abort()

  await expect(request).rejects.toBe(controller.signal.reason)
})

test('preserves cancellation while reading the response body', async () => {
  const controller = new AbortController()
  const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(response, 'json').mockImplementationOnce(async () => {
    controller.abort()
    throw controller.signal.reason
  })
  fetchMock.mockResolvedValueOnce(response)

  await expect(getHealth(controller.signal)).rejects.toHaveProperty('name', 'AbortError')
})

test('reports a failed response stream as a network failure', async () => {
  const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(response, 'json').mockRejectedValueOnce(new TypeError('stream disconnected'))
  fetchMock.mockResolvedValueOnce(response)

  await expect(getHealth()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
})
