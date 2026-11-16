import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getHealth, HealthCheckError } from '../../api/health'
import type { HealthResponse } from '../../api/health'
import ConnectionStatus from './ConnectionStatus'

vi.mock('../../api/health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/health')>()
  return { ...actual, getHealth: vi.fn() }
})

const healthMock = vi.mocked(getHealth)

function pendingHealth() {
  let finish: (value: HealthResponse) => void = () => {
    throw new Error('Pending request was not initialized')
  }
  const promise = new Promise<HealthResponse>((resolve) => { finish = resolve })
  return { promise, resolve: (value: HealthResponse) => finish(value) }
}

beforeEach(() => {
  healthMock.mockReset()
  healthMock.mockImplementation(() => new Promise<HealthResponse>(() => {}))
})

afterEach(() => {
  vi.useRealTimers()
})

test('announces loading and disables repeated submissions while checking', () => {
  render(<ConnectionStatus />)

  expect(screen.getByRole('status')).toHaveTextContent('Checking backend…')
  const button = screen.getByRole('button', { name: 'Check again' })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(healthMock).toHaveBeenCalledTimes(1)
})

test('shows backend liveness success without claiming database readiness', async () => {
  healthMock.mockResolvedValueOnce({ status: 'ok' })
  render(<ConnectionStatus />)

  await screen.findByText('Backend connected.')
  expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled()
  expect(screen.getByText(/Database and provider readiness are not checked/)).toBeInTheDocument()
})

test.each([
  {
    error: new HealthCheckError('HTTP_ERROR', 'sensitive upstream details', 503),
    message: 'The backend returned HTTP 503. Check FastAPI and try again.',
  },
  {
    error: new HealthCheckError('NETWORK_ERROR', 'sensitive upstream details'),
    message: 'Cannot reach the backend. Check that FastAPI is running, then try again.',
  },
  {
    error: new HealthCheckError('INVALID_RESPONSE', 'sensitive upstream details'),
    message: 'Unexpected backend response. Check the server and try again.',
  },
  {
    error: new Error('sensitive upstream details'),
    message: 'Could not check the backend connection. Try again.',
  },
])('shows a recoverable message: $message', async ({ error, message }) => {
  healthMock.mockRejectedValueOnce(error)
  render(<ConnectionStatus />)

  await screen.findByText(message)
  expect(screen.getByRole('status')).toHaveTextContent(message)
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled()
  expect(screen.queryByText('sensitive upstream details')).not.toBeInTheDocument()
})

test('recovers from failure on retry and disables the button during the new request', async () => {
  const retry = pendingHealth()
  healthMock.mockRejectedValueOnce(new HealthCheckError('NETWORK_ERROR', 'unreachable'))
  healthMock.mockReturnValueOnce(retry.promise)
  render(<ConnectionStatus />)

  fireEvent.click(await screen.findByRole('button', { name: 'Retry connection' }))
  const button = screen.getByRole('button', { name: 'Check again' })
  expect(button).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Checking backend…')
  fireEvent.click(button)
  expect(healthMock).toHaveBeenCalledTimes(2)

  await act(async () => { retry.resolve({ status: 'ok' }) })
  expect(screen.getByRole('status')).toHaveTextContent('Backend connected.')
})

test('ends loading and aborts the request at the five-second deadline', async () => {
  vi.useFakeTimers()
  render(<ConnectionStatus />)
  const signal = healthMock.mock.calls[0]?.[0]

  await act(async () => { vi.advanceTimersByTime(4_999) })
  expect(screen.getByRole('status')).toHaveTextContent('Checking backend…')
  await act(async () => { vi.advanceTimersByTime(1) })

  expect(screen.getByRole('status')).toHaveTextContent('The backend did not respond within 5 seconds. Try again.')
  expect(signal?.aborted).toBe(true)
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled()
})

test('aborts and clears the deadline when unmounted', () => {
  vi.useFakeTimers()
  const { unmount } = render(<ConnectionStatus />)
  const signal = healthMock.mock.calls[0]?.[0]
  expect(vi.getTimerCount()).toBe(1)

  unmount()

  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('ignores an old response after timeout while a retry is pending', async () => {
  vi.useFakeTimers()
  const oldRequest = pendingHealth()
  const retry = pendingHealth()
  healthMock.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(retry.promise)
  render(<ConnectionStatus />)
  await act(async () => { vi.advanceTimersByTime(5_000) })
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))

  await act(async () => { oldRequest.resolve({ status: 'ok' }) })
  expect(screen.getByRole('status')).toHaveTextContent('Checking backend…')

  await act(async () => { retry.resolve({ status: 'ok' }) })
  expect(screen.getByRole('status')).toHaveTextContent('Backend connected.')
})

test('handles Strict Mode cleanup without showing the cancelled request as an error', async () => {
  healthMock.mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })).mockResolvedValueOnce({ status: 'ok' })
  render(<StrictMode><ConnectionStatus /></StrictMode>)

  await screen.findByText('Backend connected.')
  expect(healthMock).toHaveBeenCalledTimes(2)
  expect(healthMock.mock.calls[0]?.[0]?.aborted).toBe(true)
  expect(healthMock.mock.calls[1]?.[0]?.aborted).toBe(false)
})
