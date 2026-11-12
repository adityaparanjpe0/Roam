import './LandingPage.css'

const plannedFeatures = [
  {
    number: '01',
    title: 'A trip that feels like you.',
    description: 'The plan: turn your interests, pace, and budget into a thoughtful day-by-day itinerary.',
  },
  {
    number: '02',
    title: 'Room to change your mind.',
    description: 'Planned flexibility: keep the activities you love and ask for changes to the rest.',
  },
  {
    number: '03',
    title: 'Good plans travel well.',
    description: 'A future PDF download will let you take your itinerary along and send it to your travel companions.',
  },
]

function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="hero page-width" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-line" /> For the curious traveler</p>
          <h1 id="hero-heading">Plan less,<br />roam <em>more.</em></h1>
          <p className="hero-description">
            Your next great trip starts with a little curiosity.
            We’re building an AI-native travel planner to help you turn it into a journey that feels like you.
          </p>
          <a className="primary-link" href="#the-idea">
            Explore the idea <span aria-hidden="true">↗</span>
          </a>
          <p className="development-note"><span aria-hidden="true" /> In development. A first look at what’s ahead.</p>
        </div>

        <figure className="travel-postcard">
          <div className="postcard-topline"><span>A note to your future self</span><span aria-hidden="true">✳</span></div>
          <svg className="landscape" viewBox="0 0 560 400" role="img" aria-labelledby="landscape-title">
            <title id="landscape-title">An illustrated sun above rolling hills and a winding coastal path</title>
            <defs>
              <clipPath id="landscape-frame"><rect width="560" height="400" rx="120" /></clipPath>
            </defs>
            <g clipPath="url(#landscape-frame)">
              <path fill="#e8dcc4" d="M0 0h560v400H0z" />
              <circle cx="384" cy="103" r="43" fill="#c86b48" />
              <path d="M0 205 100 99l103 117 86-68 116 104 155-95v243H0Z" fill="#a7b19a" />
              <path d="M0 262c94-97 141-63 224-5s172 61 336-55v198H0Z" fill="#587660" />
              <path d="M560 249c-114-7-162 52-213 74s-111 18-150 77h363Z" fill="#acc7c1" />
              <path d="M0 269c97-26 166-9 236 29 23 13 12 28-20 43-34 15-55 29-61 59H0Z" fill="#294f3c" />
              <path d="M126 400c-5-44 87-55 101-77 10-16-42-33-71-43 52 7 111 28 97 49-19 28-85 43-82 71Z" fill="#ead2a8" />
              <path d="m68 259 16-50 16 50Zm30 9 13-39 13 39Z" fill="#183f32" />
              <path d="M324 66q9-10 18 0m2 0q9-10 18 0" stroke="#294f3c" strokeWidth="2" fill="none" strokeLinecap="round" />
            </g>
          </svg>
          <figcaption>Leave a little room<br />for <em>wonder.</em></figcaption>
          <div className="postcard-bottomline"><span>Take the scenic route</span><span aria-hidden="true">↗</span></div>
        </figure>
      </section>

      <section className="idea-section page-width" id="the-idea" aria-labelledby="idea-heading">
        <div className="section-intro">
          <p className="eyebrow">The idea behind Roam</p>
          <h2 id="idea-heading">Thoughtful plans.<br /><em>Better possibilities.</em></h2>
          <p>Less time piecing it all together. More space to look forward to the trip. Here’s what we’re working toward.</p>
        </div>
        <div className="feature-grid">
          {plannedFeatures.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number" aria-hidden="true">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section page-width" id="about" aria-labelledby="about-heading">
        <div>
          <p className="eyebrow">Small team. Curious minds.</p>
          <h2 id="about-heading">Built with care.<br /><em>For the way you wander.</em></h2>
        </div>
        <div className="about-copy">
          <p>We’re two college developers building Roam around a simple belief: planning a trip should leave you excited to go.</p>
          <p>This is our starting point. Trip planning, AI-assisted changes, and PDF downloads are planned features and aren’t available yet.</p>
          <span className="status-label"><span aria-hidden="true">◌</span> A work in progress, with a destination in mind.</span>
        </div>
      </section>
    </main>
  )
}

export default LandingPage
