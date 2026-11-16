export interface HealthResponse {
  status: 'ok'
}

export type HealthErrorCode = 'HTTP_ERROR' | 'NETWORK_ERROR' | 'INVALID_RESPONSE'

export class HealthCheckError extends Error {
  readonly code: HealthErrorCode
  readonly status?: number

  constructor(code: HealthErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'HealthCheckError'
    this.code = code
    this.status = status
  }
}

/** Check backend liveness only; this does not check the database or providers. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  signal?.throwIfAborted()

  let response: Response
  try {
    response = await fetch('/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    // Preserve cancellation so the caller can distinguish timeout from cleanup.
    if (signal?.aborted) throw error
    throw new HealthCheckError('NETWORK_ERROR', 'Could not reach the backend.')
  }

  if (!response.ok) {
    throw new HealthCheckError('HTTP_ERROR', 'The backend returned an HTTP error.', response.status)
  }

  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new HealthCheckError('INVALID_RESPONSE', 'The backend returned an unexpected response.')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof SyntaxError) {
      throw new HealthCheckError('INVALID_RESPONSE', 'The backend returned invalid JSON.')
    }
    throw new HealthCheckError('NETWORK_ERROR', 'Could not read the backend response.')
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)
    || !('status' in data) || data.status !== 'ok') {
    throw new HealthCheckError('INVALID_RESPONSE', 'The backend returned an unexpected response.')
  }

  return { status: 'ok' }
}
