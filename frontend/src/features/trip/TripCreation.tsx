import { useState } from 'react'
import TripCreationForm from './TripCreationForm'
import { createInitialTripFormValues } from './tripCreationModels'
import type { TripDraft, TripFormValues } from './tripCreationModels'
import { validateTripForm } from './tripValidation'

function TripCreation() {
  const [values, setValues] = useState<TripFormValues>(createInitialTripFormValues)
  const [submitted, setSubmitted] = useState(false)
  const [validatedDraft, setValidatedDraft] = useState<TripDraft | null>(null)
  const result = submitted ? validateTripForm(values) : null

  function updateValues(next: TripFormValues) {
    setValues(next)
    setValidatedDraft(null)
  }

  function checkDetails() {
    const validation = validateTripForm(values)
    setSubmitted(true)
    setValidatedDraft(validation.valid ? validation.draft : null)
  }

  return (
    <TripCreationForm
      values={values}
      onChange={updateValues}
      onSubmit={checkDetails}
      errors={result && !result.valid ? result.errors : {}}
      validated={validatedDraft !== null}
    />
  )
}

export default TripCreation
