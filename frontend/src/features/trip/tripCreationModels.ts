// Initial frontend vocabulary; the future API must validate its own allowlist.
export type Interest =
  | 'sightseeing'
  | 'food'
  | 'culture'
  | 'outdoors'
  | 'shopping'
  | 'other'

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
  // Integer cents for the entire trip per person; zero is a known zero budget.
  budgetPerPersonMinor: number
  currency: 'USD'
  interests: Interest[]
  // Trimmed optional text; null means no constraints were supplied.
  freeTextConstraints: string | null
}

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
