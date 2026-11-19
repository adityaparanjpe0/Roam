// @vitest-environment-options {"url":"https://roam.example/"}
import { afterEach, expect, test, vi } from 'vitest'
import { logout } from './auth'

afterEach(() => {
  document.cookie = '__Host-roam_csrf=; Secure; Path=/; Max-Age=0'
  document.cookie = 'roam_csrf=; Path=/; Max-Age=0'
  vi.unstubAllGlobals()
})

test('HTTPS selects the host-prefixed CSRF cookie', async () => {
  document.cookie = `__Host-roam_csrf=${'s'.repeat(43)}; Secure; Path=/`
  document.cookie = `roam_csrf=${'l'.repeat(43)}; Path=/`
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await logout()
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
    headers: { Accept: 'application/json', 'X-CSRF-Token': 's'.repeat(43) },
  }))
})
