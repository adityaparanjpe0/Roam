import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import LandingPage from './routes/LandingPage'
import ConnectionStatus from './features/connection/ConnectionStatus'
import AuthProvider from './features/auth/AuthProvider'

function App() {
  return (
    <AuthProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <LandingPage />
      {import.meta.env.DEV && <ConnectionStatus />}
      <SiteFooter />
    </AuthProvider>
  )
}

export default App
