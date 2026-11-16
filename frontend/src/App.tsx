import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import LandingPage from './routes/LandingPage'
import ConnectionStatus from './features/connection/ConnectionStatus'

function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <LandingPage />
      {import.meta.env.DEV && <ConnectionStatus />}
      <SiteFooter />
    </>
  )
}

export default App
