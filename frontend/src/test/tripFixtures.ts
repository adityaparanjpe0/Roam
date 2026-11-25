import type { AuthUser } from '../api/auth'
import type { TripResponse } from '../api/trips'

/** Synthetic data only; factories keep each test's arrays independent. */
export function authUser(): AuthUser {
  return { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', display_name: 'Alice' }
}

export function savedTrip(overrides: Partial<TripResponse> = {}): TripResponse {
  return {
    id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'Lisbon spring break', destination_label: 'Lisbon, Portugal',
    start_date: '2027-03-27', end_date: '2027-03-30', version: 2, updated_at: '2026-11-24T12:00:00Z',
    timezone: 'Europe/Lisbon', traveler_count: 2, budget_per_person_minor: 75050, currency: 'USD',
    interests: ['food', 'culture'], free_text_constraints: 'Quiet mornings\nVegetarian meals', status: 'draft', created_at: '2026-11-24T12:00:00Z',
    ...overrides,
  }
}
