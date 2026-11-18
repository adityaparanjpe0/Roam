import { useEffect, useId, useRef, useState } from 'react'
import { INTEREST_OPTIONS } from './tripCreationModels'
import type { Interest, TripFormValues } from './tripCreationModels'
import { TRIP_FORM_LIMITS } from './tripValidation'
import type { TripFormErrors, TripFormField } from './tripValidation'
import './TripCreation.css'

interface TripCreationFormProps {
  values: TripFormValues
  onChange: (values: TripFormValues) => void
  onSubmit?: () => void
  errors?: TripFormErrors
  focusOnMount?: boolean
}

/** Controlled trip details; the container validates and handles submission. */
function TripCreationForm({ values, onChange, onSubmit, errors = {}, focusOnMount = false }: TripCreationFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [submitAttempt, setSubmitAttempt] = useState(0)
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

  useEffect(() => {
    if (focusOnMount) formRef.current?.querySelector<HTMLInputElement>('input[name="destination"]')?.focus()
  }, [focusOnMount])

  useEffect(() => {
    if (submitAttempt > 0) {
      formRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"]')?.focus()
    }
  }, [submitAttempt])

  function fieldAttributes(field: TripFormField, help?: string) {
    return {
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': [help, errors[field] ? `${id}-${field}-error` : undefined].filter(Boolean).join(' ') || undefined,
    }
  }

  function fieldError(field: TripFormField) {
    return errors[field] ? <p className="trip-field-error" id={`${id}-${field}-error`}>{errors[field]}</p> : null
  }

  function updateInterest(interest: Interest, checked: boolean) {
    const interests = checked
      ? values.interests.includes(interest) ? values.interests : [...values.interests, interest]
      : values.interests.filter((selected) => selected !== interest)

    onChange({ ...values, interests })
  }

  return (
    <form ref={formRef} className="trip-form" aria-labelledby={headingId} aria-describedby={helpId} noValidate onSubmit={(event) => {
      event.preventDefault()
      onSubmit?.()
      setSubmitAttempt((previous) => previous + 1)
    }}>
      <h2 id={headingId}>Trip details</h2>
      <p className="trip-form-help" id={helpId}>Your details stay on this page and are not saved. Itinerary planning is coming later.</p>
      <p className="trip-form-help">Required fields are marked. Additional preferences are optional.</p>
      <p className="trip-form-help">The review ignores surrounding spaces; your entered text stays unchanged when you return to edit.</p>
      {Object.keys(errors).length > 0 && <p className="trip-error-summary" role="alert">Check the highlighted fields before continuing.</p>}
      <div className="trip-form-fields">
        <div className="trip-form-field trip-form-field-wide">
          <label htmlFor={destinationId}>Destination (required)</label>
          <input
            id={destinationId}
            name="destination"
            type="text"
            required
            maxLength={TRIP_FORM_LIMITS.destinationLength}
            placeholder="e.g. Lisbon, Portugal"
            {...fieldAttributes('destination', `${destinationId}-help`)}
            value={values.destination}
            onChange={(event) => onChange({ ...values, destination: event.currentTarget.value })}
          />
          <p id={`${destinationId}-help`}>Enter a city or region you’d like to explore.</p>
          {fieldError('destination')}
        </div>
        <div className="trip-form-field">
          <label htmlFor={startDateId}>Start date (required)</label>
          <input
            id={startDateId}
            name="startDate"
            type="date"
            required
            {...fieldAttributes('startDate', `${startDateId}-help`)}
            value={values.startDate}
            onChange={(event) => onChange({ ...values, startDate: event.currentTarget.value })}
          />
          <p id={`${startDateId}-help`}>Trips can be 1–14 days, including both dates.</p>
          {fieldError('startDate')}
        </div>
        <div className="trip-form-field">
          <label htmlFor={endDateId}>End date (required)</label>
          <input
            id={endDateId}
            name="endDate"
            type="date"
            required
            {...fieldAttributes('endDate')}
            value={values.endDate}
            onChange={(event) => onChange({ ...values, endDate: event.currentTarget.value })}
          />
          {fieldError('endDate')}
        </div>
        <div className="trip-form-field">
          <label htmlFor={travelerCountId}>Number of travelers (required)</label>
          <input
            id={travelerCountId}
            name="travelerCount"
            type="number"
            inputMode="numeric"
            min="1"
            max={TRIP_FORM_LIMITS.travelers}
            step="1"
            required
            placeholder="e.g. 2"
            {...fieldAttributes('travelerCount', `${travelerCountId}-help`)}
            value={values.travelerCount}
            onChange={(event) => onChange({ ...values, travelerCount: event.currentTarget.value })}
          />
          <p id={`${travelerCountId}-help`}>Include everyone traveling, from 1 to 20 people.</p>
          {fieldError('travelerCount')}
        </div>
        <div className="trip-form-field">
          <label htmlFor={budgetId}>Budget per person (USD, required)</label>
          <input
            id={budgetId}
            name="budgetUsd"
            type="number"
            inputMode="decimal"
            min="0.01"
            max={TRIP_FORM_LIMITS.budgetUsd}
            step="0.01"
            required
            placeholder="e.g. 750.00"
            {...fieldAttributes('budgetUsd', `${budgetId}-help`)}
            value={values.budgetUsd}
            onChange={(event) => onChange({ ...values, budgetUsd: event.currentTarget.value })}
          />
          <p id={`${budgetId}-help`}>Total budget for one person for the entire trip in US dollars, not a daily amount.</p>
          {fieldError('budgetUsd')}
        </div>
        <fieldset className="trip-interests trip-form-field-wide" {...fieldAttributes('interests', interestsHelpId)}>
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
                  {...fieldAttributes('interests')}
                  onChange={(event) => updateInterest(interest.value, event.currentTarget.checked)}
                />
                <span>{interest.label}</span>
              </label>
            ))}
          </div>
          {fieldError('interests')}
        </fieldset>
        <div className="trip-form-field trip-form-field-wide">
          <label htmlFor={constraintsId}>Additional preferences or constraints (optional)</label>
          <textarea
            id={constraintsId}
            name="constraints"
            rows={5}
            maxLength={TRIP_FORM_LIMITS.constraintsLength}
            placeholder="e.g. Step-free access, a relaxed pace, or vegetarian meals"
            {...fieldAttributes('constraints', `${constraintsId}-help`)}
            value={values.constraints}
            onChange={(event) => onChange({ ...values, constraints: event.currentTarget.value })}
          />
          <p id={`${constraintsId}-help`}>Share anything else you’d like considered. Up to 4,000 characters.</p>
          {fieldError('constraints')}
        </div>
      </div>
      <button className="trip-action-button" type="submit">Review trip details</button>
    </form>
  )
}

export default TripCreationForm
