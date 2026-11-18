// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { startGoogleSignIn } from './auth'

test('the real sign-in helper starts full-page navigation to the fixed backend route', () => {
  const assign = vi.fn()
  vi.stubGlobal('window', { location: { assign } })
  startGoogleSignIn()
  expect(assign).toHaveBeenCalledExactlyOnceWith('/auth/google/start')
  expect(fetch).not.toHaveBeenCalled()
})
