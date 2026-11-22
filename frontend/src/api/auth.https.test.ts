// @vitest-environment-options {"url":"https://roam.example/"}
import { afterEach, expect, test, vi } from 'vitest'
import { logout } from './auth'
import { createTrip } from './trips'

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

test('trip creation reuses the HTTPS CSRF cookie and leaves bearer handling to the browser', async () => {
  document.cookie = `__Host-roam_csrf=${'s'.repeat(43)}; Secure; Path=/`
  document.cookie = `roam_csrf=${'l'.repeat(43)}; Path=/`
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  await expect(createTrip({
    destination_label: 'Lisbon', timezone: 'Europe/Lisbon', start_date: '2027-03-27', end_date: '2027-03-30',
    traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD', interests: ['food'],
  })).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
  expect(fetch).toHaveBeenCalledWith('/api/v1/trips', expect.objectContaining({
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': 's'.repeat(43) },
  }))
})
