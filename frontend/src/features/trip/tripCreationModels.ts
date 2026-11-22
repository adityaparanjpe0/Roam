// Frontend vocabulary; the backend independently validates its allowlist.
// Keep stable values separate from visible labels.
export const INTEREST_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'outdoors', label: 'Nature' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'culture', label: 'Art and culture' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'relaxation', label: 'Relaxation' },
] as const

export type Interest = typeof INTEREST_OPTIONS[number]['value']

/** Editable values can be blank or incomplete and are not submission data. */
export interface TripFormValues {
  destination: string
  timezone: string
  startDate: string
  endDate: string
  // Keep numeric inputs as text: an empty input is not zero or NaN.
  travelerCount: string
  budgetUsd: string
  interests: Interest[]
  // Controlled textareas use an empty string for an omitted optional value.
  constraints: string
}

/**
 * Validated local snapshot, kept separate from the snake_case API contract.
 * Timezone is explicitly supplied; the backend supplies the default trip title.
 */
export interface TripDraft {
  destinationLabel: string
  timezone: string
  // Validated calendar dates in YYYY-MM-DD format, without a time or timezone.
  startDate: string
  endDate: string
  travelerCount: number
  // Positive integer cents for the entire trip per person (PR #8 form policy).
  budgetPerPersonMinor: number
  currency: 'USD'
  interests: Interest[]
  // Trimmed optional text; null means no constraints were supplied.
  freeTextConstraints: string | null
}

/** Local review callback; it does not mean the trip has been saved. */
export type TripDraftSubmitHandler = (draft: TripDraft) => void

/** Each mounted form gets its own values and interest array. */
export function createInitialTripFormValues(): TripFormValues {
  return {
    destination: '',
    timezone: '',
    startDate: '',
    endDate: '',
    travelerCount: '',
    budgetUsd: '',
    interests: [],
    constraints: '',
  }
}
