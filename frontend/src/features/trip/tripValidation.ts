import { INTEREST_OPTIONS } from './tripCreationModels'
import type { TripDraft, TripFormValues } from './tripCreationModels'

export const TRIP_FORM_LIMITS = {
  destinationLength: 200,
  timezoneLength: 64,
  constraintsLength: 4000,
  tripDays: 14,
  travelers: 20,
  budgetUsd: 1_000_000,
} as const

export type TripFormField = keyof TripFormValues
export type TripFormErrors = Partial<Record<TripFormField, string>>
export type TripValidationResult =
  | { valid: false; errors: TripFormErrors }
  | { valid: true; draft: TripDraft }

/** Return a UTC day number only for a real, exact YYYY-MM-DD calendar date. */
function calendarDay(value: string): number | null {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return null

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > daysInMonth[month - 1]) return null

  // setUTCFullYear avoids Date.UTC's special handling of years 00–99.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime() / 86_400_000
}

/** No parseFloat, rounding, or float multiplication: decimal digits become cents. */
function budgetMinor(value: string): number | null {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) return null
  const [whole = '', fraction = ''] = value.split('.')
  const minor = Number(`${whole || '0'}${fraction.padEnd(2, '0')}`)
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > TRIP_FORM_LIMITS.budgetUsd * 100) return null
  return minor
}

/** Client feedback only: the backend independently validates every field. */
export function validateTripForm(values: TripFormValues): TripValidationResult {
  const errors: TripFormErrors = {}
  const destination = values.destination.trim()
  if (!destination) errors.destination = 'Enter a destination.'
  else if (destination.length > TRIP_FORM_LIMITS.destinationLength) {
    errors.destination = 'Keep the destination to 200 characters or fewer.'
  }

  const timezone = values.timezone.trim()
  try {
    if (!timezone || timezone.length > TRIP_FORM_LIMITS.timezoneLength
      || Array.from(timezone).some((character) => character.charCodeAt(0) <= 32)
      || /^[+-]/.test(timezone)) throw new RangeError()
    // Browser and server timezone databases can differ; server validation wins.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
  } catch {
    errors.timezone = 'Enter a destination IANA time zone, such as Europe/Lisbon.'
  }

  const start = calendarDay(values.startDate)
  const end = calendarDay(values.endDate)
  if (start === null) errors.startDate = 'Enter a valid start date.'
  if (end === null) errors.endDate = 'Enter a valid end date.'
  if (start !== null && end !== null) {
    if (end < start) errors.endDate = 'End date must be on or after start date.'
    else if (end - start + 1 > TRIP_FORM_LIMITS.tripDays) {
      errors.endDate = 'Choose a trip of 14 days or fewer, including start and end dates.'
    }
  }

  const travelersText = values.travelerCount.trim()
  const travelers = Number(travelersText)
  if (!/^\d+$/.test(travelersText) || !Number.isSafeInteger(travelers) || travelers < 1 || travelers > TRIP_FORM_LIMITS.travelers) {
    errors.travelerCount = 'Enter a whole number of travelers from 1 to 20.'
  }

  const minor = budgetMinor(values.budgetUsd.trim())
  if (minor === null) {
    errors.budgetUsd = 'Enter a USD budget greater than zero and no more than 1,000,000, with at most two decimal places.'
  }

  const allowedInterests = new Set<string>(INTEREST_OPTIONS.map((option) => option.value))
  if (values.interests.length === 0) errors.interests = 'Select at least one interest.'
  else if (values.interests.some((interest) => !allowedInterests.has(interest)) || new Set(values.interests).size !== values.interests.length) {
    errors.interests = 'Choose each interest once from the available options.'
  }

  if (values.constraints.length > TRIP_FORM_LIMITS.constraintsLength) {
    errors.constraints = 'Keep additional preferences to 4,000 characters or fewer.'
  }

  for (const field of ['destination', 'constraints'] as const) {
    // Array.from keeps valid surrogate pairs together, leaving lone surrogates.
    const invalidUnicode = Array.from(values[field]).some((character) => {
      const code = character.charCodeAt(0)
      return character.length === 1 && code >= 0xd800 && code <= 0xdfff
    })
    if (values[field].includes('\x00') || invalidUnicode) {
      errors[field] = 'Remove unsupported characters from this text.'
    }
  }

  if (Object.keys(errors).length > 0 || minor === null) return { valid: false, errors }

  return {
    valid: true,
    draft: {
      destinationLabel: destination,
      timezone,
      startDate: values.startDate,
      endDate: values.endDate,
      travelerCount: travelers,
      budgetPerPersonMinor: minor,
      currency: 'USD',
      interests: [...values.interests],
      freeTextConstraints: values.constraints.trim() || null,
    },
  }
}
