import { useState } from 'react'
import TripCreationForm from './TripCreationForm'
import { createInitialTripFormValues } from './tripCreationModels'
import type { TripFormValues } from './tripCreationModels'

function TripCreation() {
  const [values, setValues] = useState<TripFormValues>(createInitialTripFormValues)

  return <TripCreationForm values={values} onChange={setValues} />
}

export default TripCreation
