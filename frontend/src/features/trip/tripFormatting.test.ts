import { afterEach, expect, test, vi } from 'vitest'
import { formatTravelerCount, formatTripBudget, formatTripDate, tripDurationDays } from './tripFormatting'

afterEach(() => { vi.unstubAllEnvs() })

test.each(['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'])('calendar date display does not shift in %s', (zone) => {
  vi.stubEnv('TZ', zone)
  expect(formatTripDate('2027-03-27')).toBe('Mar 27, 2027')
  expect(formatTripDate('2028-02-29')).toBe('Feb 29, 2028')
})

test.each([
  ['2027-03-27', '2027-03-27', 1],
  ['2027-03-27', '2027-03-30', 4],
  ['2028-02-28', '2028-03-01', 3],
  ['2027-12-31', '2028-01-02', 3],
  ['2027-03-13', '2027-03-15', 3],
  ['2027-11-06', '2027-11-08', 3],
  ['2027-03-01', '2027-03-14', 14],
])('inclusive duration from %s through %s is %i days', (start, end, days) => {
  expect(tripDurationDays(start, end)).toBe(days)
})

test.each([[1, '1 traveler'], [2, '2 travelers'], [20, '20 travelers']] as const)('formats %i travelers with the right label', (count, label) => {
  expect(formatTravelerCount(count)).toBe(label)
})

test.each([
  [75050, 'USD', 'USD 750.50'], [0, 'USD', 'USD 0.00'],
  [120025, 'EUR', 'EUR 1,200.25'], [1234, 'JPY', 'JPY 1,234'],
  [1234, 'KWD', 'KWD 1.234'], [null, 'USD', 'Not specified'],
] as const)('formats %s minor units in %s without treating unknown as zero', (minor, currency, label) => {
  expect(formatTripBudget(minor, currency).replace(/\s/g, ' ')).toBe(label)
})
