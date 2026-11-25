import { useId } from 'react'
import type { ReactNode, RefObject } from 'react'
import { INTEREST_OPTIONS } from './tripCreationModels'
import type { TripDraft } from './tripCreationModels'
import { formatTravelerCount, formatTripBudget, formatTripDate } from './tripFormatting'
import './TripCreation.css'

interface TripReviewProps {
  draft: TripDraft
  onEdit: () => void
  onSave: () => void
  canSave: boolean
  saving: boolean
  busy?: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  children?: ReactNode
}

function TripReview({ draft, onEdit, onSave, canSave, saving, busy = false, headingRef, children }: TripReviewProps) {
  const id = useId()
  const budget = formatTripBudget(draft.budgetPerPersonMinor, draft.currency)

  return (
    <section className="trip-review" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-notice`}>
      <h2 ref={headingRef} id={`${id}-heading`} aria-describedby={`${id}-notice`} tabIndex={-1}>Review your trip</h2>
      <p className="trip-review-notice" id={`${id}-notice`}>
        Review these details before saving. <strong>Saving is confirmed only after the server responds.</strong> Refreshing clears unsaved details.
      </p>
      <dl className="trip-summary">
        <div><dt>Destination</dt><dd>{draft.destinationLabel}</dd></div>
        <div><dt>Destination time zone</dt><dd>{draft.timezone}</dd></div>
        <div><dt>Start date</dt><dd><time dateTime={draft.startDate}>{formatTripDate(draft.startDate)}</time></dd></div>
        <div><dt>End date</dt><dd><time dateTime={draft.endDate}>{formatTripDate(draft.endDate)}</time></dd></div>
        <div><dt>Number of travelers</dt><dd>{formatTravelerCount(draft.travelerCount)}</dd></div>
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
      {children}
      <div className="trip-actions" aria-busy={saving || busy}>
        <button className="trip-action-button" type="button" disabled={!canSave || saving || busy} onClick={onSave}>{saving ? 'Saving trip…' : 'Save trip'}</button>
        <button className="trip-action-button trip-action-secondary" type="button" disabled={saving || busy} onClick={onEdit}>Edit details</button>
      </div>
    </section>
  )
}

export default TripReview
