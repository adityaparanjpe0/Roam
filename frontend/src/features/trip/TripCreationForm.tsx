import { useId } from 'react'
import { INTEREST_OPTIONS } from './tripCreationModels'
import type { Interest, TripFormValues } from './tripCreationModels'
import './TripCreation.css'

interface TripCreationFormProps {
  values: TripFormValues
  onChange: (values: TripFormValues) => void
}

/** Controlled trip details; validation and local review come later. */
function TripCreationForm({ values, onChange }: TripCreationFormProps) {
  const id = useId()
  const headingId = `${id}-heading`
  const helpId = `${id}-help`
  const destinationId = `${id}-destination`
  const startDateId = `${id}-start-date`
  const endDateId = `${id}-end-date`
  const travelerCountId = `${id}-travelers`
  const budgetId = `${id}-budget`
  const interestsHelpId = `${id}-interests-help`
  const constraintsId = `${id}-constraints`

  function updateInterest(interest: Interest, checked: boolean) {
    const interests = checked
      ? values.interests.includes(interest) ? values.interests : [...values.interests, interest]
      : values.interests.filter((selected) => selected !== interest)

    onChange({ ...values, interests })
  }

  return (
    <form className="trip-form" aria-labelledby={headingId} aria-describedby={helpId} noValidate onSubmit={(event) => event.preventDefault()}>
      <h2 id={headingId}>Trip details</h2>
      <p className="trip-form-help" id={helpId}>Your details stay on this page and are not saved. Itinerary planning is coming later.</p>
      <p className="trip-form-help">Required fields are marked. Additional preferences are optional.</p>
      <div className="trip-form-fields">
        <div className="trip-form-field trip-form-field-wide">
          <label htmlFor={destinationId}>Destination (required)</label>
          <input
            id={destinationId}
            name="destination"
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Lisbon, Portugal"
            aria-describedby={`${destinationId}-help`}
            value={values.destination}
            onChange={(event) => onChange({ ...values, destination: event.currentTarget.value })}
          />
          <p id={`${destinationId}-help`}>Enter a city or region you’d like to explore.</p>
        </div>
        <div className="trip-form-field">
          <label htmlFor={startDateId}>Start date (required)</label>
          <input
            id={startDateId}
            name="startDate"
            type="date"
            required
            value={values.startDate}
            onChange={(event) => onChange({ ...values, startDate: event.currentTarget.value })}
          />
        </div>
        <div className="trip-form-field">
          <label htmlFor={endDateId}>End date (required)</label>
          <input
            id={endDateId}
            name="endDate"
            type="date"
            required
            value={values.endDate}
            onChange={(event) => onChange({ ...values, endDate: event.currentTarget.value })}
          />
        </div>
        <div className="trip-form-field">
          <label htmlFor={travelerCountId}>Number of travelers (required)</label>
          <input
            id={travelerCountId}
            name="travelerCount"
            type="number"
            inputMode="numeric"
            min="1"
            max="20"
            step="1"
            required
            placeholder="e.g. 2"
            aria-describedby={`${travelerCountId}-help`}
            value={values.travelerCount}
            onChange={(event) => onChange({ ...values, travelerCount: event.currentTarget.value })}
          />
          <p id={`${travelerCountId}-help`}>Include everyone traveling, from 1 to 20 people.</p>
        </div>
        <div className="trip-form-field">
          <label htmlFor={budgetId}>Budget per person (USD, required)</label>
          <input
            id={budgetId}
            name="budgetUsd"
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            required
            placeholder="e.g. 750.00"
            aria-describedby={`${budgetId}-help`}
            value={values.budgetUsd}
            onChange={(event) => onChange({ ...values, budgetUsd: event.currentTarget.value })}
          />
          <p id={`${budgetId}-help`}>Total budget for one person for the entire trip in US dollars, not a daily amount.</p>
        </div>
        <fieldset className="trip-interests trip-form-field-wide" aria-describedby={interestsHelpId}>
          <legend>Interests (required)</legend>
          <p className="trip-form-help" id={interestsHelpId}>Choose one or more interests for your trip.</p>
          <div className="trip-interest-options">
            {INTEREST_OPTIONS.map((interest) => (
              <label className="trip-interest-option" key={interest.value}>
                <input
                  type="checkbox"
                  name="interests"
                  value={interest.value}
                  checked={values.interests.includes(interest.value)}
                  onChange={(event) => updateInterest(interest.value, event.currentTarget.checked)}
                />
                <span>{interest.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="trip-form-field trip-form-field-wide">
          <label htmlFor={constraintsId}>Additional preferences or constraints (optional)</label>
          <textarea
            id={constraintsId}
            name="constraints"
            rows={5}
            maxLength={4000}
            placeholder="e.g. Step-free access, a relaxed pace, or vegetarian meals"
            aria-describedby={`${constraintsId}-help`}
            value={values.constraints}
            onChange={(event) => onChange({ ...values, constraints: event.currentTarget.value })}
          />
          <p id={`${constraintsId}-help`}>Share anything else you’d like considered. Up to 4,000 characters.</p>
        </div>
      </div>
    </form>
  )
}

export default TripCreationForm
