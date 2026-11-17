import { useId } from 'react'
import type { TripFormValues } from './tripCreationModels'

interface TripCreationFormProps {
  values: TripFormValues
  onChange: (values: TripFormValues) => void
}

/** Unmounted foundation: remaining fields, validation, and review come later. */
function TripCreationForm({ values, onChange }: TripCreationFormProps) {
  const id = useId()
  const headingId = `${id}-heading`
  const helpId = `${id}-help`
  const destinationId = `${id}-destination`

  return (
    <form aria-labelledby={headingId} aria-describedby={helpId} onSubmit={(event) => event.preventDefault()}>
      <h2 id={headingId}>Trip details</h2>
      <p id={helpId}>Form foundation only. Details are not saved or submitted.</p>
      <label htmlFor={destinationId}>Destination (required)</label>
      <input
        id={destinationId}
        name="destination"
        type="text"
        required
        maxLength={200}
        value={values.destination}
        onChange={(event) => onChange({ ...values, destination: event.currentTarget.value })}
      />
    </form>
  )
}

export default TripCreationForm
