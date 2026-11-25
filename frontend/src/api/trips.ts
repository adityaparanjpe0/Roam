import { AuthError, csrfCookie } from './auth'
import type { Interest } from '../features/trip/tripCreationModels'

/** Wire contract for POST /api/v1/trips, not editable form values. */
export interface TripCreateRequest {
  destination_label: string
  timezone: string
  start_date: string
  end_date: string
  traveler_count: number
  budget_per_person_minor: number
  currency: 'USD'
  interests: Interest[]
  title?: string | null
  free_text_constraints?: string | null
}

/** Compact saved metadata returned by GET /api/v1/trips. */
export interface TripSummary {
  id: string
  title: string
  destination_label: string
  // Calendar dates stay strings; converting to local instants can shift the day.
  start_date: string
  end_date: string
  version: number
  updated_at: string
}

/** Matches TripResponse; nullable fields are required keys, not omitted values. */
export interface TripResponse extends TripSummary {
  timezone: string
  traveler_count: number
  budget_per_person_minor: number | null
  currency: string
  interests: string[]
  free_text_constraints: string | null
  status: string
  created_at: string
}

export interface TripListResponse {
  items: TripSummary[]
  next_cursor: string | null
}

export interface TripListOptions {
  // Omit to use the server default of 20; supported range is 1–100.
  limit?: number
  // Pass the previous response's opaque cursor unchanged; null means first page.
  cursor?: string | null
}

const FIELD_MESSAGES = {
  destination_label: 'Enter a destination of up to 200 characters.',
  timezone: 'Choose a supported destination time zone.',
  start_date: 'Check the start date and trip date range.',
  end_date: 'Check the end date and trip date range.',
  traveler_count: 'Enter a whole number of travelers from 1 to 20.',
  budget_per_person_minor: 'Enter a positive USD budget of no more than 1,000,000.',
  currency: 'Use USD for this trip.',
  interests: 'Choose one or more different interests from the available options.',
  title: 'Enter a title of up to 120 characters.',
  free_text_constraints: 'Check your preferences; use no more than 4,000 characters.',
} as const

export type TripFieldErrors = Partial<Record<keyof TripCreateRequest, string>>
const ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: 'Sign in to save your trip.',
  CSRF_FAILED: 'Request verification failed. Sign in again before saving.',
  VALIDATION_FAILED: 'The server could not accept these trip details. Check your entries.',
  DATABASE_UNAVAILABLE: 'Trip storage is unavailable. Saving was not confirmed.',
  AUTH_NOT_CONFIGURED: 'Sign-in is unavailable. Try again later.',
  UNAVAILABLE: 'The backend is unavailable. Saving was not confirmed.',
  HTTP_ERROR: 'The backend returned an unexpected error. Saving was not confirmed.',
  NETWORK_ERROR: 'The connection failed. Your trip may have been saved; do not retry automatically.',
  TIMEOUT: 'Saving timed out. Your trip may have been saved; do not retry automatically.',
  INVALID_RESPONSE: 'The backend returned an unexpected response. Your trip may have been saved.',
  RESOURCE_NOT_FOUND: 'Trip not found or unavailable.',
  FORBIDDEN: 'This request is not permitted.',
} as const

export type TripErrorCode = keyof typeof ERROR_MESSAGES
type TripOperation = 'create' | 'read'

const READ_ERROR_MESSAGES: Record<TripErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Sign in to view your saved trips.',
  CSRF_FAILED: 'The request was rejected. Check your session and try again.',
  VALIDATION_FAILED: 'The trip ID or pagination options are invalid.',
  DATABASE_UNAVAILABLE: 'Trip storage is unavailable. Try loading again later.',
  AUTH_NOT_CONFIGURED: 'Sign-in is unavailable. Try again later.',
  UNAVAILABLE: 'The backend is unavailable. Try loading again later.',
  HTTP_ERROR: 'The backend returned an unexpected error while loading trips.',
  NETWORK_ERROR: 'Could not load trips. Check your connection and try again.',
  TIMEOUT: 'Loading trips timed out. Try again.',
  INVALID_RESPONSE: 'The backend returned an unexpected trip response.',
  RESOURCE_NOT_FOUND: 'Trip not found or unavailable.',
  FORBIDDEN: 'This request was not permitted. Check your sign-in status before trying again.',
}

export class TripApiError extends Error {
  readonly code: TripErrorCode
  readonly status?: number
  readonly requestId?: string
  readonly fieldErrors: TripFieldErrors

  constructor(code: TripErrorCode, status?: number, requestId?: string, fieldErrors: TripFieldErrors = {}, operation: TripOperation = 'create') {
    super(operation === 'read' ? READ_ERROR_MESSAGES[code] : ERROR_MESSAGES[code])
    this.name = 'TripApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
    this.fieldErrors = fieldErrors
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRIPS_PATH = '/api/v1/trips'

function cursor(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= maximum
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && calendarDate(value.slice(0, 10))
    && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function tripSummary(value: unknown, status: number): TripSummary {
  if (!record(value) || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)
    || !text(value.title, 120) || !text(value.destination_label, 200)
    || !calendarDate(value.start_date) || !calendarDate(value.end_date)
    || !integer(value.version, 1) || !timestamp(value.updated_at)) {
    throw new TripApiError('INVALID_RESPONSE', status)
  }
  return {
    id: value.id, title: value.title, destination_label: value.destination_label,
    start_date: value.start_date, end_date: value.end_date,
    version: value.version, updated_at: value.updated_at,
  }
}

function tripResponse(value: unknown, status: number): TripResponse {
  const summary = tripSummary(value, status)
  if (!record(value) || !text(value.timezone, 64)
    || !integer(value.traveler_count, 1)
    || !(value.budget_per_person_minor === null || integer(value.budget_per_person_minor, 0))
    || !text(value.currency, 3) || !Array.isArray(value.interests) || !value.interests.every((item: unknown) => typeof item === 'string')
    || !(value.free_text_constraints === null || (typeof value.free_text_constraints === 'string' && Array.from(value.free_text_constraints).length <= 4000))
    || !text(value.status, 16) || !timestamp(value.created_at)) {
    throw new TripApiError('INVALID_RESPONSE', status)
  }
  // Copy the documented fields only; extra profile/token/owner data stays out.
  return {
    ...summary, timezone: value.timezone,
    traveler_count: value.traveler_count, budget_per_person_minor: value.budget_per_person_minor,
    currency: value.currency, interests: [...value.interests], free_text_constraints: value.free_text_constraints,
    status: value.status, created_at: value.created_at,
  }
}

function tripListResponse(value: unknown, status: number): TripListResponse {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 100
    || !(value.next_cursor === null || cursor(value.next_cursor))) {
    throw new TripApiError('INVALID_RESPONSE', status)
  }
  return { items: value.items.map((item: unknown) => tripSummary(item, status)), next_cursor: value.next_cursor }
}

async function json(response: Response): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new TripApiError('INVALID_RESPONSE', response.status)
  }
  try { return await response.json() as unknown } catch (error) {
    if (error instanceof SyntaxError) throw new TripApiError('INVALID_RESPONSE', response.status)
    throw error
  }
}

async function failure(response: Response, operation: TripOperation): Promise<TripApiError> {
  let body: unknown
  // Proxy failures need not use JSON. HTTP status still establishes rejection.
  try { body = await json(response) } catch { body = null }
  const error = record(body) && record(body.error) ? body.error : null
  const code: TripErrorCode = response.status === 401 ? 'AUTHENTICATION_REQUIRED'
    : response.status === 403 ? operation === 'read' ? 'FORBIDDEN' : 'CSRF_FAILED'
    : response.status === 404 && operation === 'read' ? 'RESOURCE_NOT_FOUND'
    : response.status === 422 ? 'VALIDATION_FAILED'
    : response.status === 503 && (error?.code === 'DATABASE_UNAVAILABLE' || error?.code === 'AUTH_NOT_CONFIGURED') ? error.code
    : response.status >= 500 ? 'UNAVAILABLE' : 'HTTP_ERROR'
  const recognized = error?.code === code
  const requestId = recognized && typeof error.request_id === 'string' && UUID_PATTERN.test(error.request_id) ? error.request_id : undefined
  const fields: TripFieldErrors = {}
  if (operation === 'create' && code === 'VALIDATION_FAILED' && recognized && record(error.details)) {
    for (const field of Object.keys(FIELD_MESSAGES) as (keyof typeof FIELD_MESSAGES)[]) {
      if (typeof error.details[field] === 'string') fields[field] = FIELD_MESSAGES[field]
    }
  }
  // Never expose server messages, arbitrary detail keys/values, HTML or SQL.
  return new TripApiError(code, response.status, requestId, fields)
}

/** Shared trip-only transport; auth and UI lifecycle remain with their callers. */
async function tripRequest<T>(
  path: string,
  options: RequestInit,
  expectedStatus: 200 | 201,
  parse: (value: unknown, status: number) => T,
  operation: TripOperation,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 10_000)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const response = await fetch(path, {
      ...options, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
    })
    if (response.status !== expectedStatus) throw await failure(response, operation)
    const result = parse(await json(response), response.status)
    controller.signal.throwIfAborted()
    return result
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (timedOut) throw new TripApiError('TIMEOUT', undefined, undefined, {}, operation)
    if (error instanceof TripApiError) {
      throw new TripApiError(error.code, error.status, error.requestId, error.fieldErrors, operation)
    }
    throw new TripApiError('NETWORK_ERROR', undefined, undefined, {}, operation)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

/** One explicit POST, never an automatic retry. Abort does not undo a commit. */
export async function createTrip(data: TripCreateRequest, signal?: AbortSignal): Promise<TripResponse> {
  signal?.throwIfAborted()
  let csrf: string
  try { csrf = csrfCookie() } catch (error) {
    if (error instanceof AuthError && error.code === 'CSRF_FAILED') throw new TripApiError('CSRF_FAILED')
    throw error
  }
  // Allowlist request fields too: structural TS types can carry extra properties.
  const payload: TripCreateRequest = {
    destination_label: data.destination_label, timezone: data.timezone,
    start_date: data.start_date, end_date: data.end_date, traveler_count: data.traveler_count,
    budget_per_person_minor: data.budget_per_person_minor, currency: data.currency,
    interests: [...data.interests], title: data.title, free_text_constraints: data.free_text_constraints,
  }
  return tripRequest(TRIPS_PATH, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(payload),
  }, 201, tripResponse, 'create', signal)
}

/** One owner-scoped page. Ownership comes from the session, never a user ID. */
export async function listTrips(options: TripListOptions = {}, signal?: AbortSignal): Promise<TripListResponse> {
  signal?.throwIfAborted()
  const { limit, cursor: after } = options
  if ((limit !== undefined && (!integer(limit, 1) || limit > 100))
    || (after !== undefined && after !== null && !cursor(after))) {
    throw new TripApiError('VALIDATION_FAILED', undefined, undefined, {}, 'read')
  }
  const query = new URLSearchParams()
  if (limit !== undefined) query.set('limit', String(limit))
  if (after !== undefined && after !== null) query.set('cursor', after)
  const suffix = query.size > 0 ? `?${query}` : ''
  return tripRequest(`${TRIPS_PATH}${suffix}`, {
    method: 'GET', headers: { Accept: 'application/json' },
  }, 200, tripListResponse, 'read', signal)
}

/** Saved metadata only: the current API does not return itinerary contents. */
export async function getTrip(tripId: string, signal?: AbortSignal): Promise<TripResponse> {
  signal?.throwIfAborted()
  if (!UUID_PATTERN.test(tripId)) {
    throw new TripApiError('VALIDATION_FAILED', undefined, undefined, {}, 'read')
  }
  return tripRequest(`${TRIPS_PATH}/${encodeURIComponent(tripId)}`, {
    method: 'GET', headers: { Accept: 'application/json' },
  }, 200, tripResponse, 'read', signal)
}
