import type { TripSummary } from '../../api/trips'
import TripCard from './TripCard'

/** Presentation only. Reads, authentication and pagination live outside this list. */
function SavedTripList({ trips }: { trips: TripSummary[] }) {
  return (
    <ul className="saved-trip-list" aria-label="Saved trips">
      {trips.map((trip) => (
        <li key={trip.id}>
          <TripCard trip={trip} href={`/trips/${encodeURIComponent(trip.id)}`} />
        </li>
      ))}
    </ul>
  )
}

export default SavedTripList
