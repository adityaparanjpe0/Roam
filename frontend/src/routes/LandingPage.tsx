import './LandingPage.css'

const plannedFeatures = [
  {
    title: 'Plan around your preferences',
    description: 'Start with your destination, dates, interests, and budget. Roam will help organize them into a day-by-day itinerary.',
  },
  {
    title: 'Change part of your trip',
    description: 'Keep the activities you love and ask for changes to the rest, without starting your whole itinerary over.',
  },
  {
    title: 'Take your itinerary with you',
    description: 'Download a PDF of your saved trip to reference on the go or send to your travel companions.',
  },
]

function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="hero page-width" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <h1 id="hero-heading">Plan less,<br /><span>roam more.</span></h1>
          <p className="hero-description">
            A travel planner built around your interests, budget, and pace.
            We’re building Roam to help you create an itinerary, adjust the details, and take your plan along.
          </p>
          <a className="primary-link" href="#the-idea">
            See planned features <span aria-hidden="true">↓</span>
          </a>
          <p className="development-note">Roam is in development. Planning features aren’t available yet.</p>
        </div>

        <figure className="planner-preview" aria-labelledby="preview-title preview-caption">
          <div className="preview-header">
            <h2 id="preview-title">Your city break</h2>
            <p>A day at your pace</p>
          </div>
          <ol className="preview-timeline" aria-label="Illustrative day plan">
            <li><p className="day-period">Morning</p><h3>A neighborhood walk</h3><p>Start slow and explore somewhere new.</p></li>
            <li><p className="day-period">Afternoon</p><h3>A museum stop</h3><p>Make room for what interests you.</p></li>
            <li><p className="day-period">Evening</p><h3>Dinner, unhurried</h3><p>Leave time to settle in and enjoy it.</p></li>
          </ol>
          <figcaption id="preview-caption">Illustrative planner concept. Not generated or interactive.</figcaption>
        </figure>
      </section>

      <section className="idea-section page-width" id="the-idea" aria-labelledby="idea-heading">
        <div className="section-intro">
          <h2 id="idea-heading">One place to shape your trip.</h2>
          <p>These are the features we’re working toward.</p>
        </div>
        <div className="feature-grid">
          {plannedFeatures.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section page-width" id="about" aria-labelledby="about-heading">
        <div>
          <h2 id="about-heading">Built by two students who want to make trip planning simpler.</h2>
        </div>
        <div className="about-copy">
          <p>We’re learning by building a focused travel planner: a place to organize your days, keep the plans you care about, and make changes along the way.</p>
          <p>This landing page is our first step. It introduces the idea while we build the planning experience.</p>
        </div>
      </section>
    </main>
  )
}

export default LandingPage
