import { useId, useLayoutEffect, useRef } from 'react'
import type { TripResponse } from '../../api/trips'
import { INTEREST_OPTIONS } from './tripCreationModels'
import { formatTravelerCount, formatTripBudget, formatTripDate } from './tripFormatting'

interface TripSavedProps {
  trip: TripResponse
  onCreateAnother: () => void
}

function TripSaved({ trip, onCreateAnother }: TripSavedProps) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => { heading.current?.focus() }, [])
  const budget = formatTripBudget(trip.budget_per_person_minor, trip.currency)

  return (
    <section className="trip-review" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-notice`}>
      <h2 ref={heading} id={`${id}-heading`} tabIndex={-1}>Trip saved</h2>
      <p id={`${id}-notice`} role="status">Your trip details were saved to your account. They remain saved after a refresh. Itinerary planning is coming later.</p>
      <dl className="trip-summary">
        <div><dt>Title</dt><dd>{trip.title}</dd></div>
        <div><dt>Destination</dt><dd>{trip.destination_label}</dd></div>
        <div><dt>Destination time zone</dt><dd>{trip.timezone}</dd></div>
        <div><dt>Start date</dt><dd><time dateTime={trip.start_date}>{formatTripDate(trip.start_date)}</time></dd></div>
        <div><dt>End date</dt><dd><time dateTime={trip.end_date}>{formatTripDate(trip.end_date)}</time></dd></div>
        <div><dt>Number of travelers</dt><dd>{formatTravelerCount(trip.traveler_count)}</dd></div>
        <div><dt>Budget per person</dt><dd>{budget} for the entire trip</dd></div>
        <div><dt>Interests</dt><dd><ul aria-label="Saved interests">{trip.interests.map((interest) => <li key={interest}>{INTEREST_OPTIONS.find((option) => option.value === interest)?.label ?? interest}</li>)}</ul></dd></div>
        <div className="trip-summary-wide"><dt>Additional preferences or constraints</dt><dd className="trip-review-preferences">{trip.free_text_constraints ?? 'No additional preferences provided.'}</dd></div>
        <div><dt>Trip ID</dt><dd>{trip.id}</dd></div>
      </dl>
      <p className="trip-form-help trip-save-feedback">This confirmation clears on refresh. Your trip remains saved in My Trips.</p>
      <button className="trip-action-button" type="button" onClick={onCreateAnother}>Create another trip</button>
    </section>
  )
}

export default TripSaved
