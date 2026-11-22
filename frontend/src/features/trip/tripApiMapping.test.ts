import { expect, test } from 'vitest'
import { tripCreateRequest, tripFormErrors } from './tripApiMapping'
import { validateTripForm } from './tripValidation'
import { createInitialTripFormValues } from './tripCreationModels'

test('maps a validated snapshot to exact wire fields without float/date conversion or owner data', () => {
  const result = validateTripForm({ ...createInitialTripFormValues(),
    destination: ' Lisbon ', timezone: ' Europe/Lisbon ', startDate: '2027-03-27', endDate: '2027-03-30',
    travelerCount: '2', budgetUsd: '0.29', interests: ['food'], constraints: '  ',
  })
  if (!result.valid) throw new Error('Expected a valid fixture')
  const input = { ...result.draft, owner_id: 'NOT_AUTHORITY', status: 'ready' }
  const mapped = tripCreateRequest(input)
  expect(mapped).toEqual({ destination_label: 'Lisbon', timezone: 'Europe/Lisbon', start_date: '2027-03-27',
    end_date: '2027-03-30', traveler_count: 2, budget_per_person_minor: 29, currency: 'USD',
    interests: ['food'], free_text_constraints: null,
  })
  expect(mapped.interests).not.toBe(result.draft.interests)
})

test('maps recognized API fields to form fields and leaves non-editable fields general', () => {
  expect(tripFormErrors({ timezone: 'Timezone rejected', budget_per_person_minor: 'Budget rejected', title: 'Title rejected' }))
    .toEqual({ timezone: 'Timezone rejected', budgetUsd: 'Budget rejected' })
})
