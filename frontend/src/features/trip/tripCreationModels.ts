// Frontend vocabulary only; the future API must validate its own allowlist.
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
 * Target shape after validation and normalization, not an API contract.
 * PR #11 will map this to the generated request type once one exists.
 * Required backend title/timezone handling remains a future integration decision.
 */
export interface TripDraft {
  destinationLabel: string
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

/** A normalized-draft handoff; the future parent owns API/pending/error behavior. */
export type TripDraftSubmitHandler = (draft: TripDraft) => void

/** Each mounted form gets its own values and interest array. */
export function createInitialTripFormValues(): TripFormValues {
  return {
    destination: '',
    startDate: '',
    endDate: '',
    travelerCount: '',
    budgetUsd: '',
    interests: [],
    constraints: '',
  }
}
