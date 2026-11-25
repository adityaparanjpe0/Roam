import { useLayoutEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import LandingPage from './routes/LandingPage'
import ConnectionStatus from './features/connection/ConnectionStatus'
import AuthProvider from './features/auth/AuthProvider'
import SavedTripsPage from './routes/SavedTripsPage'
import TripDetailsPage from './routes/TripDetailsPage'

function HomePage() {
  const { hash } = useLocation()
  useLayoutEffect(() => {
    // Cross-page fragments can be processed before React mounts their targets.
    if (!['#create-trip', '#the-idea', '#about', '#top'].includes(hash)) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    const focusTarget = hash === '#create-trip' ? target.querySelector<HTMLElement>('input') ?? target : target
    focusTarget.focus({ preventScroll: true })
    target.scrollIntoView?.({ block: 'start' })
  }, [hash])
  return hash === '#my-trips' ? <Navigate to="/trips" replace /> : <LandingPage />
}

function AppLayout() {
  const { pathname } = useLocation()
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <SiteHeader home={pathname === '/'} />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/trips" element={<SavedTripsPage />} />
      <Route path="/trips/:tripId" element={<TripDetailsPage />} />
      <Route path="*" element={<main className="route-shell page-width" id="main-content" tabIndex={-1}>
        <h1>Page not found</h1><p>We couldn’t find that page.</p><a className="primary-link" href="/trips">Go to My Trips</a>
      </main>} />
    </Routes>
    {import.meta.env.DEV && <ConnectionStatus />}
    <SiteFooter />
  </>
}

function App() {
  return (
    <BrowserRouter><AuthProvider><AppLayout /></AuthProvider></BrowserRouter>
  )
}

export default App
