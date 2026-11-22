import type { TripCreateRequest, TripFieldErrors } from '../../api/trips'
import type { TripDraft } from './tripCreationModels'
import type { TripFormErrors, TripFormField } from './tripValidation'

/** Map only validated values; never send owner, version, status or timestamps. */
export function tripCreateRequest(draft: TripDraft): TripCreateRequest {
  return {
    destination_label: draft.destinationLabel, timezone: draft.timezone,
    start_date: draft.startDate, end_date: draft.endDate,
    traveler_count: draft.travelerCount, budget_per_person_minor: draft.budgetPerPersonMinor,
    currency: draft.currency, interests: [...draft.interests],
    free_text_constraints: draft.freeTextConstraints,
  }
}

const FORM_FIELDS = {
  destination_label: 'destination', timezone: 'timezone', start_date: 'startDate', end_date: 'endDate',
  traveler_count: 'travelerCount', budget_per_person_minor: 'budgetUsd',
  interests: 'interests', free_text_constraints: 'constraints',
} as const satisfies Partial<Record<keyof TripCreateRequest, TripFormField>>

export function tripFormErrors(fields: TripFieldErrors): TripFormErrors {
  const result: TripFormErrors = {}
  for (const field of Object.keys(FORM_FIELDS) as (keyof typeof FORM_FIELDS)[]) {
    if (fields[field]) result[FORM_FIELDS[field]] = fields[field]
  }
  return result
}
