import { useEffect, useState } from 'react'
import { getHealth, HealthCheckError } from '../../api/health'
import './ConnectionStatus.css'

type ConnectionState =
  | { status: 'loading' }
  | { status: 'connected' }
  | { status: 'error'; message: string }

const REQUEST_TIMEOUT_MS = 5_000

function errorMessage(error: unknown): string {
  if (error instanceof HealthCheckError) {
    switch (error.code) {
      case 'HTTP_ERROR':
        return error.status === undefined
          ? 'The backend returned an HTTP error. Check FastAPI and try again.'
          : `The backend returned HTTP ${error.status}. Check FastAPI and try again.`
      case 'NETWORK_ERROR':
        return 'Cannot reach the backend. Check that FastAPI is running, then try again.'
      case 'INVALID_RESPONSE':
        return 'Unexpected backend response. Check the server and try again.'
    }
  }

  return 'Could not check the backend connection. Try again.'
}

function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    // Each attempt owns this flag, so an older request cannot overwrite a retry.
    let active = true

    const timeout = setTimeout(() => {
      if (!active) return
      active = false
      controller.abort()
      setState({ status: 'error', message: 'The backend did not respond within 5 seconds. Try again.' })
    }, REQUEST_TIMEOUT_MS)

    async function checkConnection() {
      try {
        await getHealth(controller.signal)
        if (active) setState({ status: 'connected' })
      } catch (error) {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      } finally {
        clearTimeout(timeout)
      }
    }

    void checkConnection()

    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((previous) => previous + 1)
  }

  const message = state.status === 'loading'
    ? 'Checking backend…'
    : state.status === 'connected'
      ? 'Backend connected.'
      : state.message

  return (
    <aside className="connection-status page-width" aria-labelledby="connection-heading" aria-busy={state.status === 'loading'}>
      <div>
        <h2 id="connection-heading">Backend connection</h2>
        <p className="connection-help">Development check only. Database and provider readiness are not checked.</p>
        <p className="connection-message" role="status" aria-atomic="true" data-state={state.status}>
          {message}
        </p>
      </div>
      <button className="connection-check" type="button" onClick={retry} disabled={state.status === 'loading'}>
        {state.status === 'error' ? 'Retry connection' : 'Check again'}
      </button>
    </aside>
  )
}

export default ConnectionStatus
