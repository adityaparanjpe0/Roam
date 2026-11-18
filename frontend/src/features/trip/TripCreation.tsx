import { useState } from 'react'
import TripCreationForm from './TripCreationForm'
import TripReview from './TripReview'
import { createInitialTripFormValues } from './tripCreationModels'
import type { TripDraft, TripDraftSubmitHandler, TripFormValues } from './tripCreationModels'
import { validateTripForm } from './tripValidation'

interface TripCreationProps {
  onDraftSubmit?: TripDraftSubmitHandler
}

function TripCreation({ onDraftSubmit }: TripCreationProps) {
  const [values, setValues] = useState<TripFormValues>(createInitialTripFormValues)
  const [submitted, setSubmitted] = useState(false)
  const [validatedDraft, setValidatedDraft] = useState<TripDraft | null>(null)
  const [focusForm, setFocusForm] = useState(false)
  const result = submitted ? validateTripForm(values) : null

  function updateValues(next: TripFormValues) {
    setValues(next)
    setValidatedDraft(null)
  }

  function submitDetails() {
    const validation = validateTripForm(values)
    setSubmitted(true)
    if (!validation.valid) {
      setValidatedDraft(null)
      return
    }

    setValidatedDraft(validation.draft)
    onDraftSubmit?.(validation.draft)
  }

  function editDetails() {
    setValidatedDraft(null)
    setFocusForm(true)
  }

  if (validatedDraft) {
    return <TripReview draft={validatedDraft} onEdit={editDetails} />
  }

  return (
    <TripCreationForm
      values={values}
      onChange={updateValues}
      onSubmit={submitDetails}
      errors={result && !result.valid ? result.errors : {}}
      focusOnMount={focusForm}
    />
  )
}

export default TripCreation
