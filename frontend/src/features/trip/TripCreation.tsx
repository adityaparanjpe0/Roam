import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { startGoogleSignIn } from '../../api/auth'
import { createTrip, TripApiError } from '../../api/trips'
import type { TripResponse } from '../../api/trips'
import { useAuth } from '../auth/authContext'
import TripCreationForm from './TripCreationForm'
import TripReview from './TripReview'
import TripSaved from './TripSaved'
import { tripCreateRequest, tripFormErrors } from './tripApiMapping'
import { createInitialTripFormValues } from './tripCreationModels'
import type { TripDraft, TripDraftSubmitHandler, TripFormValues } from './tripCreationModels'
import { validateTripForm } from './tripValidation'
import type { TripFormErrors, TripFormField } from './tripValidation'

interface TripCreationProps {
  onDraftSubmit?: TripDraftSubmitHandler
}

type SaveState = { status: 'idle' } | { status: 'saving' }
  | { status: 'saved'; trip: TripResponse } | { status: 'error'; error: TripApiError }

interface ReviewedTripProps {
  draft: TripDraft
  auth: ReturnType<typeof useAuth>
  headingRef: RefObject<HTMLHeadingElement | null>
  onEdit: () => void
  onCreateAnother: () => void
  onValidation: (fields: TripFormErrors, message: string) => void
}

/** Keyed by account availability: unmount cancels/forgets previous-account work. */
function ReviewedTrip({ draft, auth, headingRef, onEdit, onCreateAnother, onValidation }: ReviewedTripProps) {
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [leaving, setLeaving] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const feedback = useRef<HTMLParagraphElement>(null)
  const canSave = auth.state.status === 'authenticated' && !auth.signingOut && !leaving

  useEffect(() => () => { request.current?.abort(); request.current = null }, [])
  useLayoutEffect(() => { if (save.status === 'error') feedback.current?.focus() }, [save])

  async function saveTrip() {
    // The ref closes the gap before React renders a disabled button.
    if (!canSave || request.current !== null || save.status === 'saved') return
    const controller = new AbortController()
    request.current = controller
    setSave({ status: 'saving' })
    try {
      const trip = await createTrip(tripCreateRequest(draft), controller.signal)
      if (!controller.signal.aborted && request.current === controller) setSave({ status: 'saved', trip })
    } catch (failure) {
      if (controller.signal.aborted || request.current !== controller) return
      const error = failure instanceof TripApiError ? failure : new TripApiError('NETWORK_ERROR')
      const fields = tripFormErrors(error.fieldErrors)
      if (error.code === 'VALIDATION_FAILED' && Object.keys(fields).length > 0) {
        onValidation(fields, error.message)
      } else {
        setSave({ status: 'error', error })
        if (error.code === 'AUTHENTICATION_REQUIRED') auth.retry()
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  function signInAgain() {
    if (leaving) return
    setLeaving(true)
    try { startGoogleSignIn() } catch {
      setLeaving(false)
      setNavigationError('Could not open sign-in. Try again.')
    }
  }

  if (save.status === 'saved') return <TripSaved trip={save.trip} onCreateAnother={onCreateAnother} />

  return (
    <TripReview draft={draft} headingRef={headingRef} onEdit={onEdit}
      onSave={() => { void saveTrip() }} canSave={canSave} saving={save.status === 'saving'} busy={leaving}>
      <p className="trip-form-help trip-save-feedback" role="status">
        {save.status === 'saving' ? 'Saving trip…' : leaving ? 'Opening sign-in…'
          : auth.signingOut ? 'Signing out. Saving is unavailable.'
            : auth.state.status === 'loading' ? 'Checking sign-in before saving…'
              : auth.state.status === 'unauthenticated' ? 'Sign in using the account controls to save. Signing in clears unsaved details.'
                : auth.state.status === 'error' ? 'Could not confirm your account. Use the account controls to retry before saving.' : ''}
      </p>
      {save.status === 'error' && <p ref={feedback} className="trip-error-summary" role="alert" tabIndex={-1}>{save.error.message}</p>}
      {save.status === 'error' && save.error.code === 'CSRF_FAILED' && <>
        <p className="trip-form-help">Signing in again leaves this page and clears unsaved trip details.</p>
        <button className="trip-action-button" type="button" disabled={leaving} onClick={signInAgain}>Sign in again</button>
      </>}
      {navigationError && <p className="trip-error-summary" role="alert">{navigationError}</p>}
    </TripReview>
  )
}

function TripCreation({ onDraftSubmit }: TripCreationProps) {
  const auth = useAuth()
  const [values, setValues] = useState<TripFormValues>(createInitialTripFormValues)
  const [submitted, setSubmitted] = useState(false)
  const [validatedDraft, setValidatedDraft] = useState<TripDraft | null>(null)
  const [focusForm, setFocusForm] = useState(false)
  const [serverErrors, setServerErrors] = useState<TripFormErrors>({})
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const result = submitted ? validateTripForm(values) : null

  // Review navigation requests focus. Background auth changes do not.
  useLayoutEffect(() => { if (validatedDraft) headingRef.current?.focus() }, [validatedDraft])

  function updateValues(next: TripFormValues) {
    const remaining = { ...serverErrors }
    for (const field of Object.keys(remaining) as TripFormField[]) {
      if (values[field] !== next[field]) delete remaining[field]
    }
    setServerErrors(remaining)
    setServerMessage(null)
    setValues(next)
    setValidatedDraft(null)
  }

  function submitDetails() {
    const validation = validateTripForm(values)
    setSubmitted(true)
    if (!validation.valid || Object.keys(serverErrors).length > 0) {
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

  function backendValidation(fields: TripFormErrors, message: string) {
    setServerErrors(fields)
    setServerMessage(message)
    editDetails()
  }

  function createAnother() {
    setValues(createInitialTripFormValues())
    setSubmitted(false)
    setValidatedDraft(null)
    setServerErrors({})
    setServerMessage(null)
    setFocusForm(true)
  }

  if (validatedDraft) {
    const accountKey = auth.state.status === 'authenticated' && !auth.signingOut ? auth.state.user.id : 'no-account'
    return <ReviewedTrip key={accountKey} draft={validatedDraft} auth={auth} headingRef={headingRef}
      onEdit={editDetails} onCreateAnother={createAnother} onValidation={backendValidation} />
  }

  return (
    <TripCreationForm
      values={values}
      onChange={updateValues}
      onSubmit={submitDetails}
      errors={{ ...serverErrors, ...(result && !result.valid ? result.errors : {}) }}
      serverMessage={serverMessage}
      focusOnMount={focusForm}
    />
  )
}

export default TripCreation
