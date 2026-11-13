import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import LandingPage from './routes/LandingPage'

function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <LandingPage />
      <SiteFooter />
    </>
  )
}

export default App
