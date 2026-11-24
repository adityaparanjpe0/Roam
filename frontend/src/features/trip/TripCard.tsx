import { useId } from 'react'
import type { TripSummary } from '../../api/trips'
import { formatTripDate, tripDurationDays } from './tripFormatting'

interface TripCardProps {
  trip: TripSummary
  href: string
}

/** Presentation only: the collection response owns which fields are available. */
function TripCard({ trip, href }: TripCardProps) {
  const headingId = useId()
  const days = tripDurationDays(trip.start_date, trip.end_date)

  return (
    <article className="trip-card" aria-labelledby={headingId}>
      <div className="trip-card-heading">
        <p className="trip-card-eyebrow">Saved trip details</p>
        <h2 id={headingId}>{trip.title}</h2>
        {trip.destination_label !== trip.title && <p className="trip-card-destination">{trip.destination_label}</p>}
      </div>
      <dl className="trip-card-facts">
        <div>
          <dt>Travel dates</dt>
          <dd><time dateTime={trip.start_date}>{formatTripDate(trip.start_date)}</time><span className="trip-card-date-divider">–</span><time dateTime={trip.end_date}>{formatTripDate(trip.end_date)}</time></dd>
        </div>
        <div><dt>Duration</dt><dd>{days} {days === 1 ? 'day' : 'days'}</dd></div>
      </dl>
      <div className="trip-card-footer">
        <a className="trip-card-link" href={href} aria-label={`View Trip: ${trip.title}`}>
          View Trip <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  )
}

export default TripCard
