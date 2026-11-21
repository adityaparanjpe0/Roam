import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as auth from '../api/auth'
import AuthProvider from '../features/auth/AuthProvider'
import SiteHeader from './SiteHeader'

const prototype = HTMLDialogElement.prototype
const showModal = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const close = Object.getOwnPropertyDescriptor(prototype, 'close')

beforeEach(() => {
  vi.spyOn(auth, 'getCurrentUser').mockResolvedValue(null)
  // JSDOM has no native top layer/focus trap; browser checks cover those.
  Object.defineProperty(prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) } })
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  for (const [name, descriptor] of [['showModal', showModal], ['close', close]] as const) {
    if (descriptor) Object.defineProperty(prototype, name, descriptor)
    else Reflect.deleteProperty(prototype, name)
  }
})

function renderHeader() { return render(<AuthProvider><SiteHeader /></AuthProvider>) }

test('keeps navigation focused and exposes the current anchor', () => {
  window.history.replaceState(null, '', '#create-trip')
  renderHeader()
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(navigation).getAllByRole('link')).toHaveLength(3)
  expect(within(navigation).getByRole('link', { name: 'Trip details' })).toHaveAttribute('aria-current', 'location')
  expect(screen.getByRole('link', { name: 'Roam home' })).toHaveAttribute('href', '#top')
  window.history.replaceState(null, '', '#about')
  fireEvent(window, new Event('hashchange'))
  expect(within(navigation).getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'location')
})

test('the labeled menu opens a modal drawer and Escape restores trigger focus', async () => {
  renderHeader()
  const trigger = screen.getByRole('button', { name: 'Menu' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Explore Roam' })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(dialog).toHaveAttribute('open')
  expect(document.body.style.overflow).toBe('hidden')
  expect(await within(dialog).findByRole('button', { name: 'Sign in with Google' })).toHaveAccessibleDescription('Signing in leaves this page and clears unsaved trip details.')
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
})

test('selecting a drawer link closes it and updates the active destination', () => {
  render(<AuthProvider><SiteHeader /><section id="about" tabIndex={-1}>About Roam</section></AuthProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  const dialog = screen.getByRole('dialog', { name: 'Explore Roam' })
  fireEvent.click(within(dialog).getByRole('link', { name: 'About' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('About Roam')).toHaveFocus()
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'location')
})

test('resizing to desktop dismisses the drawer and releases scroll lock', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  renderHeader()
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  fireEvent(window, new Event('resize'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.style.overflow).toBe('')
})
