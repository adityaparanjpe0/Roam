import { useEffect, useRef, useState } from 'react'
import AuthControls from '../features/auth/AuthControls'
import './SiteHeader.css'

const links = [
  { id: 'create-trip', label: 'Trip details' },
  { id: 'the-idea', label: 'Planned features' },
  { id: 'about', label: 'About' },
]

function SiteHeader() {
  const [active, setActive] = useState(() => window.location.hash.slice(1) || 'top')
  const [menuOpen, setMenuOpen] = useState(false)
  const header = useRef<HTMLElement>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navigationTarget = useRef<string | null>(null)

  function closeMenu() {
    drawer.current?.close()
    setMenuOpen(false)
  }

  function openMenu() {
    setMenuOpen(true)
    drawer.current?.showModal()
  }

  function finishClosingMenu() {
    setMenuOpen(false)
    if (navigationTarget.current) {
      document.getElementById(navigationTarget.current)?.focus({ preventScroll: true })
    } else {
      menuButton.current?.focus()
    }
    navigationTarget.current = null
  }

  function chooseSection(id: string, mobile: boolean) {
    setActive(id)
    if (mobile) {
      navigationTarget.current = id
      closeMenu()
    }
  }

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onResize = () => {
      if (window.matchMedia('(min-width: 56rem)').matches) {
        drawer.current?.close()
        setMenuOpen(false)
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  useEffect(() => {
    let frame = 0
    const updatePosition = () => {
      const offset = (header.current?.getBoundingClientRect().height ?? 80) + 24
      let current = 'top'
      for (const { id } of links) {
        const section = document.getElementById(id)
        if (section?.getClientRects().length && section.getBoundingClientRect().top <= offset) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updatePosition)
    }
    const onHashChange = () => setActive(window.location.hash.slice(1) || 'top')
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', onHashChange)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  function navigation(mobile = false) {
    return (
      <nav aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>
        {links.map(({ id, label }) => (
          <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined} onClick={() => chooseSection(id, mobile)}>
            {label}<span aria-hidden="true" className="nav-arrow">↗</span>
          </a>
        ))}
      </nav>
    )
  }

  return (
    <>
    <div id="top" aria-hidden="true" />
    <header ref={header} className="site-header">
      <div className="site-header-inner page-width">
      <a className="wordmark" href="#top" aria-label="Roam home" aria-current={active === 'top' ? 'page' : undefined} onClick={() => setActive('top')}>
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="m5 25 9-19 4 12 9-11-8 19-5-12Z" fill="currentColor" />
        </svg>
        roam<span className="wordmark-dot">.</span>
      </a>
      <div className="site-header-actions">
        {navigation()}
        <AuthControls />
      </div>
      <button ref={menuButton} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="roam-mobile-menu" aria-haspopup="dialog" onClick={openMenu}>
        Menu <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 8h16M4 16h16" /></svg>
      </button>
      </div>
      <dialog
        ref={drawer} id="roam-mobile-menu" className="mobile-menu" aria-labelledby="mobile-menu-title"
        onCancel={(event) => { event.preventDefault(); closeMenu() }}
        onClose={finishClosingMenu}
        onClick={(event) => { if (event.target === event.currentTarget) closeMenu() }}
      >
        {menuOpen && <div className="mobile-menu-content">
          <div className="mobile-menu-top">
            <h2 id="mobile-menu-title">Explore Roam</h2>
            <button type="button" className="menu-close" onClick={closeMenu} autoFocus>Close <span aria-hidden="true">×</span></button>
          </div>
          {navigation(true)}
          <div className="mobile-menu-account"><AuthControls /></div>
        </div>}
      </dialog>
    </header>
    </>
  )
}

export default SiteHeader
