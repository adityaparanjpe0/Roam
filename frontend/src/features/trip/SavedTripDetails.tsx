import type { TripResponse } from '../../api/trips'
import { INTEREST_OPTIONS } from './tripCreationModels'
import { formatTravelerCount, formatTripBudget, formatTripDate, tripDurationDays } from './tripFormatting'

/** Canonical saved metadata only; no requests or inferred itinerary contents. */
function SavedTripDetails({ trip }: { trip: TripResponse }) {
  const days = tripDurationDays(trip.start_date, trip.end_date)
  return <>
    <header className="trip-details-header">
      <h2>{trip.title}</h2>
      <p>Saved trip details</p>
    </header>
    <dl className="trip-details-facts">
      <div><dt>Destination</dt><dd>{trip.destination_label}</dd></div>
      <div><dt>Destination time zone</dt><dd>{trip.timezone}</dd></div>
      <div><dt>Start date</dt><dd><time dateTime={trip.start_date}>{formatTripDate(trip.start_date)}</time></dd></div>
      <div><dt>End date</dt><dd><time dateTime={trip.end_date}>{formatTripDate(trip.end_date)}</time></dd></div>
      <div><dt>Duration</dt><dd>{days} calendar {days === 1 ? 'day' : 'days'} (inclusive)</dd></div>
      <div><dt>Travelers</dt><dd>{formatTravelerCount(trip.traveler_count)}</dd></div>
      <div><dt>Total budget per person</dt><dd>{formatTripBudget(trip.budget_per_person_minor, trip.currency)}{trip.budget_per_person_minor !== null && ' for the entire trip'}</dd></div>
      <div><dt>Interests</dt><dd>{trip.interests.length ? <ul aria-label="Saved interests">
        {trip.interests.map((interest, index) => <li key={`${index}-${interest}`}>{INTEREST_OPTIONS.find((option) => option.value === interest)?.label ?? interest}</li>)}
      </ul> : 'No interests provided.'}</dd></div>
      <div className="trip-details-wide"><dt>Additional preferences or constraints</dt><dd className="trip-details-preferences">{trip.free_text_constraints?.trim() ? trip.free_text_constraints : 'No additional preferences provided.'}</dd></div>
    </dl>
    <section className="saved-trips-panel" aria-labelledby="trip-itinerary-heading">
      <h2 id="trip-itinerary-heading">Itinerary</h2>
      <p>Itinerary details are not available in this view. The current API returns saved trip preferences, without itinerary activities or confirmation of whether an itinerary has been generated.</p>
    </section>
  </>
}

export default SavedTripDetails
