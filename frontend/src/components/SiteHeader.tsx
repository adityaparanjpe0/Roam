function SiteHeader() {
  return (
    <header className="site-header page-width" id="top">
      <a className="wordmark" href="#top" aria-label="Roam home">
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="m5 25 9-19 4 12 9-11-8 19-5-12Z" fill="currentColor" />
        </svg>
        roam<span className="wordmark-dot">.</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="#the-idea">Planned features</a>
        <a href="#about">About</a>
      </nav>
    </header>
  )
}

export default SiteHeader
