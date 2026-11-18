import { StrictMode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import TripCreation from './TripCreation'
import TripCreationForm from './TripCreationForm'
import { createInitialTripFormValues } from './tripCreationModels'

test('keeps numeric defaults empty and does not share interest selections', () => {
  const first = createInitialTripFormValues()
  const second = createInitialTripFormValues()

  expect(first.travelerCount).toBe('')
  expect(first.budgetUsd).toBe('')
  expect(first.constraints).toBe('')
  first.interests.push('food')
  expect(second.interests).toEqual([])
})

test('edits a destination through local controlled state', () => {
  render(<TripCreation />)
  const destination = screen.getByRole('textbox', { name: 'Destination (required)' })

  expect(destination).toHaveValue('')
  expect(destination).toBeRequired()
  fireEvent.change(destination, { target: { value: 'New York' } })
  expect(destination).toHaveValue('New York')
  fireEvent.change(destination, { target: { value: '' } })
  expect(destination).toHaveValue('')
})

test('changing a field preserves other raw editable values', () => {
  const values = {
    ...createInitialTripFormValues(),
    travelerCount: '2',
    budgetUsd: '125.',
    constraints: 'Step-free access',
  }
  const onChange = vi.fn()
  render(<TripCreationForm values={values} onChange={onChange} />)

  fireEvent.change(screen.getByRole('textbox', { name: 'Destination (required)' }), {
    target: { value: 'Boston' },
  })

  expect(onChange).toHaveBeenCalledWith({ ...values, destination: 'Boston' })
  expect(values.destination).toBe('')
})

test('mounted forms have independent state and uniquely associated labels', () => {
  render(<><TripCreation /><TripCreation /></>)
  const [firstForm, secondForm] = screen.getAllByRole('form', { name: 'Trip details' })
  if (!firstForm || !secondForm) throw new Error('Expected two trip forms')
  const firstInput = within(firstForm).getByLabelText('Destination (required)')
  const secondInput = within(secondForm).getByLabelText('Destination (required)')

  expect(firstInput.id).not.toBe(secondInput.id)
  fireEvent.change(firstInput, { target: { value: 'Chicago' } })
  expect(firstInput).toHaveValue('Chicago')
  expect(secondInput).toHaveValue('')
})

test('prevents native submission and provides a local validation action', () => {
  render(<TripCreation />)
  const form = screen.getByRole('form', { name: 'Trip details' })

  expect(fireEvent.submit(form)).toBe(false)
  expect(within(form).getByRole('button', { name: 'Review trip details' })).toBeInTheDocument()
  expect(form).toHaveAccessibleDescription('Your details stay on this page and are not saved. Itinerary planning is coming later.')
})

test('shows associated field errors after submit and focuses the first invalid input', () => {
  render(<TripCreation />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields')
  const destination = screen.getByLabelText('Destination (required)')
  expect(destination).toHaveFocus()
  expect(destination).toHaveAttribute('aria-invalid', 'true')
  expect(destination).toHaveAccessibleDescription(expect.stringContaining('Enter a destination.'))
  expect(screen.getByRole('checkbox', { name: 'Food' })).toHaveAccessibleDescription('Select at least one interest.')
  expect(screen.queryByRole('region', { name: 'Review your trip' })).not.toBeInTheDocument()

  fireEvent.change(destination, { target: { value: 'Lisbon' } })
  expect(destination).not.toHaveAttribute('aria-invalid')
  expect(screen.queryByText('Enter a destination.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByLabelText('Start date (required)')).toHaveFocus()
  expect(destination).toHaveValue('Lisbon')
})

test('reviews normalized details and returns to all original editable values', () => {
  render(<TripCreation />)
  for (const [label, value] of [
    ['Destination (required)', ' Lisbon '],
    ['Start date (required)', '2027-03-27'],
    ['End date (required)', '2027-03-30'],
    ['Number of travelers (required)', '2'],
    ['Budget per person (USD, required)', '750.50'],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  const notes = ' Step-free access\nVegetarian meals '
  fireEvent.change(screen.getByLabelText('Additional preferences or constraints (optional)'), { target: { value: notes } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Nature' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  const review = screen.getByRole('region', { name: 'Review your trip' })
  expect(within(review).getByRole('heading', { name: 'Review your trip' })).toHaveFocus()
  expect(review).toHaveAccessibleDescription('This is a local review. Your trip has not been saved. Refreshing this page clears your details.')
  expect(within(review).getByText('Lisbon', { exact: true })).toBeInTheDocument()
  expect(within(review).getByText('2027-03-27')).toHaveAttribute('datetime', '2027-03-27')
  expect(within(review).getByText('2027-03-30')).toHaveAttribute('datetime', '2027-03-30')
  expect(within(review).getByText('2', { exact: true })).toBeInTheDocument()
  expect(within(review).getByText('$750.50 for the entire trip')).toBeInTheDocument()
  expect(within(review).getByRole('list', { name: 'Selected interests' })).toHaveTextContent('FoodNature')
  expect(within(review).getByText(/Step-free access/)).toHaveTextContent('Step-free access Vegetarian meals')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue(' Lisbon ')
  expect(screen.getByLabelText('Destination (required)')).toHaveFocus()
  expect(screen.getByLabelText('Start date (required)')).toHaveValue('2027-03-27')
  expect(screen.getByLabelText('End date (required)')).toHaveValue('2027-03-30')
  expect(screen.getByLabelText('Number of travelers (required)')).toHaveValue(2)
  expect(screen.getByLabelText('Budget per person (USD, required)')).toHaveValue(750.5)
  expect(screen.getByLabelText('Additional preferences or constraints (optional)')).toHaveValue(notes)
  expect(screen.getByRole('checkbox', { name: 'Nature' })).toBeChecked()

  fireEvent.change(screen.getByLabelText('Budget per person (USD, required)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.queryByRole('region', { name: 'Review your trip' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Budget per person (USD, required)')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('checkbox', { name: 'Food' })).toBeChecked()
})

test('hands only valid normalized drafts to the callback once per explicit review, including Strict Mode', () => {
  const onDraftSubmit = vi.fn()
  render(<StrictMode><TripCreation onDraftSubmit={onDraftSubmit} /></StrictMode>)
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(onDraftSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: 'Review your trip' })).not.toBeInTheDocument()

  for (const [label, value] of [
    ['Destination (required)', ' Lisbon '], ['Start date (required)', '2027-03-27'],
    ['End date (required)', '2027-03-30'], ['Number of travelers (required)', '2'],
    ['Budget per person (USD, required)', '0.29'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(onDraftSubmit).toHaveBeenCalledTimes(1)
  expect(onDraftSubmit).toHaveBeenLastCalledWith({
    destinationLabel: 'Lisbon', startDate: '2027-03-27', endDate: '2027-03-30',
    travelerCount: 2, budgetPerPersonMinor: 29, currency: 'USD', interests: ['food'],
    freeTextConstraints: null,
  })
  expect(screen.queryByRole('button', { name: 'Review trip details' })).not.toBeInTheDocument()
  expect(screen.getByText('No additional preferences provided.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  fireEvent.change(screen.getByLabelText('Destination (required)'), { target: { value: 'Porto' } })
  expect(onDraftSubmit).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(onDraftSubmit).toHaveBeenCalledTimes(2)
  expect(onDraftSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ destinationLabel: 'Porto', budgetPerPersonMinor: 29 }))
})

test('renders review text literally without treating preferences or destination as markup', () => {
  const { container } = render(<TripCreation />)
  for (const [label, value] of [
    ['Destination (required)', '<b>Lisbon</b>'], ['Start date (required)', '2027-03-27'],
    ['End date (required)', '2027-03-30'], ['Number of travelers (required)', '2'],
    ['Budget per person (USD, required)', '10'],
    ['Additional preferences or constraints (optional)', '<img src=x onerror=alert(1)>\nQuiet mornings'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByText('<b>Lisbon</b>', { exact: true })).toBeInTheDocument()
  expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
  expect(container.querySelector('.trip-review img')).toBeNull()
  expect(container.querySelector('.trip-review b')).toBeNull()
})

test('rechecks dependent dates and focuses the interest group when it is the only error', () => {
  render(<TripCreation />)
  for (const [label, value] of [
    ['Destination (required)', 'Lisbon'], ['Start date (required)', '2027-03-27'],
    ['End date (required)', '2027-03-26'], ['Number of travelers (required)', '2'],
    ['Budget per person (USD, required)', '10'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByLabelText('End date (required)')).toHaveFocus()
  expect(screen.getByText('End date must be on or after start date.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Start date (required)'), { target: { value: '2027-03-25' } })
  expect(screen.queryByText('End date must be on or after start date.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByRole('checkbox', { name: 'Food' })).toHaveFocus()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  expect(screen.queryByText('Select at least one interest.')).not.toBeInTheDocument()
})

test('all five core inputs start blank and have visible required labels', () => {
  render(<TripCreation />)

  for (const label of [
    'Destination (required)',
    'Start date (required)',
    'End date (required)',
    'Number of travelers (required)',
    'Budget per person (USD, required)',
  ]) {
    const input = screen.getByLabelText(label)
    expect(input).toHaveProperty('value', '')
    expect(input).toBeRequired()
  }
  expect(screen.getByLabelText('Start date (required)')).toHaveAttribute('type', 'date')
  expect(screen.getByLabelText('End date (required)')).toHaveAttribute('type', 'date')
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
  expect(screen.getByLabelText('Budget per person (USD, required)')).toHaveAccessibleDescription(
    'Total budget for one person for the entire trip in US dollars, not a daily amount.',
  )
})

test('editing and clearing dates and numeric fields preserves the other inputs', () => {
  render(<TripCreation />)
  const fields = [
    { label: 'Start date (required)', value: '2027-03-27' },
    { label: 'End date (required)', value: '2027-03-30' },
    { label: 'Number of travelers (required)', value: '3' },
    { label: 'Budget per person (USD, required)', value: '750.50' },
  ]
  const destination = screen.getByLabelText('Destination (required)')
  fireEvent.change(destination, { target: { value: 'Lisbon' } })

  for (const field of fields) {
    fireEvent.change(screen.getByLabelText(field.label), { target: { value: field.value } })
  }
  for (const field of fields) {
    expect(screen.getByLabelText(field.label)).toHaveProperty('value', field.value)
  }
  expect(destination).toHaveValue('Lisbon')
  const budget = screen.getByLabelText('Budget per person (USD, required)')
  fireEvent.change(budget, { target: { value: '0' } })
  expect(budget).toHaveValue(0)

  for (const field of fields) {
    const input = screen.getByLabelText(field.label)
    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveProperty('value', '')
  }
  expect(destination).toHaveValue('Lisbon')
})

test('shows eight unchecked interests in a named group and an empty optional textarea', () => {
  render(<TripCreation />)
  const group = screen.getByRole('group', { name: 'Interests (required)' })
  expect(group).toHaveAccessibleDescription('Choose one or more interests for your trip.')
  expect(within(group).getAllByRole('checkbox')).toHaveLength(8)

  for (const name of ['Food', 'Sightseeing', 'Nature', 'Nightlife', 'Shopping', 'Art and culture', 'Adventure', 'Relaxation']) {
    expect(within(group).getByRole('checkbox', { name })).not.toBeChecked()
  }
  const constraints = screen.getByRole('textbox', { name: 'Additional preferences or constraints (optional)' })
  expect(constraints).toHaveValue('')
  expect(constraints).not.toBeRequired()
  expect(constraints.tagName).toBe('TEXTAREA')
})

test('selects multiple interests and deselects them independently', () => {
  render(<TripCreation />)
  const food = screen.getByRole('checkbox', { name: 'Food' })
  const nature = screen.getByRole('checkbox', { name: 'Nature' })
  fireEvent.click(food)
  fireEvent.click(nature)
  expect(food).toBeChecked()
  expect(nature).toBeChecked()
  fireEvent.click(food)
  expect(food).not.toBeChecked()
  expect(nature).toBeChecked()
  fireEvent.click(nature)
  expect(nature).not.toBeChecked()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('interest and multiline preference changes preserve all other editable values', () => {
  render(<TripCreation />)
  const fields = [
    { label: 'Destination (required)', value: 'Lisbon' },
    { label: 'Start date (required)', value: '2027-03-27' },
    { label: 'End date (required)', value: '2027-03-30' },
    { label: 'Number of travelers (required)', value: '3' },
    { label: 'Budget per person (USD, required)', value: '750.50' },
  ]
  for (const field of fields) {
    fireEvent.change(screen.getByLabelText(field.label), { target: { value: field.value } })
  }
  const constraints = screen.getByLabelText('Additional preferences or constraints (optional)')
  const notes = 'Step-free access\nVegetarian meals'
  fireEvent.change(constraints, { target: { value: notes } })
  const culture = screen.getByRole('checkbox', { name: 'Art and culture' })
  fireEvent.click(culture)
  expect(constraints).toHaveValue(notes)
  for (const field of fields) {
    expect(screen.getByLabelText(field.label)).toHaveProperty('value', field.value)
  }
  fireEvent.change(screen.getByLabelText('Destination (required)'), { target: { value: 'Porto' } })
  fireEvent.change(constraints, { target: { value: '' } })
  expect(culture).toBeChecked()
  expect(screen.getByLabelText('Destination (required)')).toHaveValue('Porto')
  expect(constraints).toHaveValue('')
})

test('interest updates use stable values without mutating the previous selection', () => {
  const values = createInitialTripFormValues()
  values.interests = ['food']
  const onChange = vi.fn()
  render(<TripCreationForm values={values} onChange={onChange} />)

  fireEvent.click(screen.getByRole('checkbox', { name: 'Nature' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...values, interests: ['food', 'outdoors'] })
  expect(values.interests).toEqual(['food'])
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...values, interests: [] })
})
