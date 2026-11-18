import { expect, test } from 'vitest'
import { createInitialTripFormValues } from './tripCreationModels'
import type { TripFormValues } from './tripCreationModels'
import { validateTripForm } from './tripValidation'
import type { TripFormField } from './tripValidation'

function validValues(): TripFormValues {
  return {
    ...createInitialTripFormValues(),
    destination: 'Lisbon',
    startDate: '2027-03-27',
    endDate: '2027-03-30',
    travelerCount: '2',
    budgetUsd: '750.50',
    interests: ['food'],
  }
}

test('returns every missing required field and no draft', () => {
  const result = validateTripForm(createInitialTripFormValues())
  expect(result.valid).toBe(false)
  expect(result).not.toHaveProperty('draft')
  if (!result.valid) {
    expect(Object.keys(result.errors)).toEqual(['destination', 'startDate', 'endDate', 'travelerCount', 'budgetUsd', 'interests'])
  }
})

test('normalizes a valid draft without changing or sharing editable values', () => {
  const values = { ...validValues(), destination: ' Lisbon ', constraints: ' Step-free access\nVegetarian meals ' }
  const original = structuredClone(values)
  const result = validateTripForm(values)
  expect(result).toEqual({
    valid: true,
    draft: {
      destinationLabel: 'Lisbon',
      startDate: '2027-03-27', endDate: '2027-03-30', travelerCount: 2,
      budgetPerPersonMinor: 75050, currency: 'USD', interests: ['food'],
      freeTextConstraints: 'Step-free access\nVegetarian meals',
    },
  })
  expect(values).toEqual(original)
  if (result.valid) {
    values.interests.push('culture')
    expect(result.draft.interests).toEqual(['food'])
  }
})

test.each(['', '   ', '\n\t'])('normalizes absent constraints to null: %j', (constraints) => {
  const result = validateTripForm({ ...validValues(), constraints })
  expect(result.valid).toBe(true)
  if (result.valid) expect(result.draft.freeTextConstraints).toBeNull()
})

const malformedFields: { field: TripFormField; value: string }[] = [
  { field: 'destination', value: ' \t\n ' },
  { field: 'destination', value: 'x'.repeat(201) },
  { field: 'startDate', value: '2027-02-29' },
  { field: 'startDate', value: '1900-02-29' },
  { field: 'startDate', value: '2027-04-31' },
  { field: 'startDate', value: '2027-13-01' },
  { field: 'startDate', value: '2027-00-01' },
  { field: 'startDate', value: '2027-01-00' },
  { field: 'startDate', value: '0000-01-01' },
  { field: 'startDate', value: '2027-3-01' },
  { field: 'startDate', value: '2027-03-27T00:00:00Z' },
  { field: 'startDate', value: '2027-03-27\n' },
  { field: 'startDate', value: ' 2027-03-27' },
  { field: 'endDate', value: 'not-a-date' },
  { field: 'endDate', value: '2027-03-26' },
  { field: 'endDate', value: '2027-04-10' },
  ...['', ' ', '0', '-1', '1.5', '2.0', '1e1', '0x10', '2people', 'NaN', 'Infinity', '21', '9007199254740993'].map((value) => ({ field: 'travelerCount' as const, value })),
  ...['', ' ', '0', '0.00', '-1', 'NaN', 'Infinity', '1e2', '0x10', '100usd', '1,000', '$10', '1.001', '1.', '1.2.3', '1000000.01', '9'.repeat(400)].map((value) => ({ field: 'budgetUsd' as const, value })),
  { field: 'constraints', value: 'x'.repeat(4001) },
]

test.each(malformedFields)('rejects malformed $field: $value', ({ field, value }) => {
  const result = validateTripForm({ ...validValues(), [field]: value })
  expect(result.valid).toBe(false)
  expect(result).not.toHaveProperty('draft')
  if (!result.valid) expect(result.errors[field]).toBeTruthy()
})

test.each([
  ['0.01', 1], ['.50', 50], ['0.29', 29], ['12.3', 1230], [' 750.50 ', 75050], ['1000000', 100000000],
])('converts decimal budget %s exactly to %i cents', (budgetUsd, minor) => {
  const result = validateTripForm({ ...validValues(), budgetUsd: String(budgetUsd) })
  expect(result.valid).toBe(true)
  if (result.valid) expect(result.draft.budgetPerPersonMinor).toBe(minor)
})

test.each([
  ['2028-02-29', '2028-02-29'],
  ['2000-02-29', '2000-03-01'],
  ['0096-02-29', '0096-03-01'],
  ['2027-03-27', '2027-04-09'],
  ['2027-12-31', '2028-01-01'],
])('accepts real calendar dates and inclusive limits: %s to %s', (startDate, endDate) => {
  expect(validateTripForm({ ...validValues(), startDate, endDate }).valid).toBe(true)
})

test('rejects unknown and duplicate interest IDs even if static typing is bypassed', () => {
  for (const interests of [['food', 'food'], ['made-up'], []]) {
    const values = validValues()
    Reflect.set(values, 'interests', interests)
    const result = validateTripForm(values)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.interests).toBeTruthy()
  }
})

test('accepts exact text and party bounds', () => {
  expect(validateTripForm({ ...validValues(), destination: 'x'.repeat(200), constraints: 'x'.repeat(4000), travelerCount: '20' }).valid).toBe(true)
})
