import type { TripSummary } from '../../api/trips'

/** Presentation only. Reads, authentication and pagination live outside this list. */
function SavedTripList({ trips }: { trips: TripSummary[] }) {
  return (
    <ul className="saved-trip-list" aria-label="Saved trips">
      {trips.map((trip) => (
        <li key={trip.id}>
          <h3>{trip.title}</h3>
          <p>{trip.destination_label}</p>
          <p><time dateTime={trip.start_date}>{trip.start_date}</time> to <time dateTime={trip.end_date}>{trip.end_date}</time></p>
        </li>
      ))}
    </ul>
  )
}

export default SavedTripList
