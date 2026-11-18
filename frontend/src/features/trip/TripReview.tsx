import { useEffect, useId, useRef } from 'react'
import { INTEREST_OPTIONS } from './tripCreationModels'
import type { TripDraft } from './tripCreationModels'
import './TripCreation.css'

interface TripReviewProps {
  draft: TripDraft
  onEdit: () => void
}

function TripReview({ draft, onEdit }: TripReviewProps) {
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const budget = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: draft.currency,
  }).format(draft.budgetPerPersonMinor / 100)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="trip-review" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-notice`}>
      <h2 ref={headingRef} id={`${id}-heading`} tabIndex={-1}>Review your trip</h2>
      <p className="trip-review-notice" id={`${id}-notice`}>
        This is a local review. Your trip has not been saved. Refreshing this page clears your details.
      </p>
      <dl className="trip-summary">
        <div><dt>Destination</dt><dd>{draft.destinationLabel}</dd></div>
        <div><dt>Start date</dt><dd><time dateTime={draft.startDate}>{draft.startDate}</time></dd></div>
        <div><dt>End date</dt><dd><time dateTime={draft.endDate}>{draft.endDate}</time></dd></div>
        <div><dt>Number of travelers</dt><dd>{draft.travelerCount}</dd></div>
        <div><dt>Total budget per person (USD)</dt><dd>{budget} for the entire trip</dd></div>
        <div>
          <dt>Interests</dt>
          <dd>
            <ul aria-label="Selected interests">
              {draft.interests.map((interest) => (
                <li key={interest}>{INTEREST_OPTIONS.find((option) => option.value === interest)?.label ?? interest}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="trip-summary-wide">
          <dt>Additional preferences or constraints</dt>
          <dd className="trip-review-preferences">{draft.freeTextConstraints ?? 'No additional preferences provided.'}</dd>
        </div>
      </dl>
      <button className="trip-action-button" type="button" onClick={onEdit}>Edit details</button>
    </section>
  )
}

export default TripReview
