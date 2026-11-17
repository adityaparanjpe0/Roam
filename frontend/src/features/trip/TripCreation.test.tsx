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

test('prevents default form submission and exposes no submit action yet', () => {
  render(<TripCreation />)
  const form = screen.getByRole('form', { name: 'Trip details' })

  expect(fireEvent.submit(form)).toBe(false)
  expect(within(form).queryByRole('button')).not.toBeInTheDocument()
  expect(form).toHaveAccessibleDescription('Form foundation only. Details are not saved or submitted.')
})
