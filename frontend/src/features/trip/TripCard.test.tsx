import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { TripSummary } from '../../api/trips'
import TripCard from './TripCard'
import SavedTripList from './SavedTripList'

const trip: TripSummary = {
  id: '95bc33a8-2238-4467-9660-cc60f760826d', title: 'A long weekend in Lisbon',
  destination_label: 'Lisbon, Portugal', start_date: '2027-03-27', end_date: '2027-03-30',
  version: 1, updated_at: '2026-11-24T12:00:00Z',
}
const href = `/trips/${trip.id}`

test('renders an accessible card from a typed summary without making requests', () => {
  render(<TripCard trip={trip} href={href} />)
  const card = screen.getByRole('article', { name: trip.title })
  expect(within(card).getByRole('heading', { name: trip.title, level: 2 })).toBeInTheDocument()
  expect(within(card).getByText('Lisbon, Portugal')).toBeInTheDocument()
  expect(within(card).getByText('Mar 27, 2027')).toHaveAttribute('datetime', '2027-03-27')
  expect(within(card).getByText('Mar 30, 2027')).toHaveAttribute('datetime', '2027-03-30')
  expect(within(card).getByText('4 days')).toBeInTheDocument()
  expect(within(card).getByRole('link', { name: `View Trip: ${trip.title}` })).toHaveAttribute('href', href)
  expect(within(card).queryByText(/travelers|budget|interests/i)).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

test('shows one day for a one-day trip and avoids repeating an identical destination', () => {
  render(<TripCard trip={{ ...trip, title: trip.destination_label, end_date: trip.start_date }} href={href} />)
  expect(screen.getByText('1 day')).toBeInTheDocument()
  expect(screen.getAllByText(trip.destination_label)).toHaveLength(1)
})

test('keeps long names and literal untrusted text accessible', () => {
  const title = '<img src=x onerror=alert(1)> A long name that should wrap across multiple lines in the travel card'
  const view = render(<TripCard trip={{ ...trip, title }} href={href} />)
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: `View Trip: ${title}` })).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
})

test('list reordering preserves each trip card identity and its stable-ID link', () => {
  const other = { ...trip, id: '00000000-0000-0000-0000-000000000002', title: 'Tokyo next spring' }
  const view = render(<SavedTripList trips={[trip, other]} />)
  const first = screen.getByRole('article', { name: trip.title })
  view.rerender(<SavedTripList trips={[other, trip]} />)
  expect(screen.getAllByRole('article')[1]).toBe(first)
  expect(within(first).getByRole('link')).toHaveAttribute('href', href)
  expect(fetch).not.toHaveBeenCalled()
})
