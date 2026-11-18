import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('introduces Roam with named landmarks and a single primary heading', () => {
  render(<App />)

  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  const main = screen.getByRole('main')
  expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Plan less,roam more.')
})

test('all navigation links point to existing, unique page targets', () => {
  const { container } = render(<App />)

  for (const link of screen.getAllByRole('link')) {
    const target = link.getAttribute('href')
    expect(target).toMatch(/^#[a-z-]+$/)
    if (!target) throw new Error('Navigation link is missing its target')
    expect(container.querySelectorAll(target)).toHaveLength(1)
  }

  expect(screen.getByRole('link', { name: 'See planned features' })).toHaveAttribute('href', '#the-idea')
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
  expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
})

test('clearly explains that planning capabilities are not available yet', () => {
  render(<App />)

  expect(screen.getByText('Roam is in development. Planning features aren’t available yet.')).toBeInTheDocument()
  expect(screen.getByText('Illustrative planner concept. Not generated or interactive.')).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'Illustrative day plan' })).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(within(screen.getByRole('main')).getByRole('button', { name: 'Review trip details' })).toBeInTheDocument()
})

test('includes a developer connection check without changing the landing page', () => {
  render(<App />)

  expect(screen.getByRole('complementary', { name: 'Backend connection' })).toBeInTheDocument()
  expect(within(screen.getByRole('complementary', { name: 'Backend connection' })).getByRole('status')).toHaveTextContent('Checking backend…')
})

test('omits the connection diagnostic and its requests outside development', () => {
  vi.stubEnv('DEV', false)
  render(<App />)

  expect(screen.queryByRole('complementary', { name: 'Backend connection' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.anything())
})

test('exposes the core trip form without issuing requests when editing', () => {
  vi.stubEnv('DEV', false)
  render(<App />)

  expect(screen.getByRole('link', { name: 'Enter trip details' })).toHaveAttribute('href', '#create-trip')
  const form = screen.getByRole('form', { name: 'Trip details' })
  const authRequests = vi.mocked(fetch).mock.calls.length
  expect(screen.getByRole('region', { name: 'Create a trip' })).toContainElement(form)
  fireEvent.change(within(form).getByLabelText('Destination (required)'), { target: { value: 'Lisbon' } })
  fireEvent.change(within(form).getByLabelText('Budget per person (USD, required)'), { target: { value: '500' } })
  fireEvent.click(within(form).getByRole('checkbox', { name: 'Food' }))
  fireEvent.change(within(form).getByLabelText('Additional preferences or constraints (optional)'), { target: { value: 'A relaxed pace' } })
  fireEvent.submit(form)

  expect(within(form).getByLabelText('Destination (required)')).toHaveValue('Lisbon')
  expect(fetch).toHaveBeenCalledTimes(authRequests)
})

test('reviews and edits a trip without additional requests or browser storage writes', () => {
  vi.stubEnv('DEV', false)
  const localWrite = vi.spyOn(Storage.prototype, 'setItem')
  render(<App />)
  const authRequests = vi.mocked(fetch).mock.calls.length
  for (const [label, value] of [
    ['Destination (required)', 'Lisbon'], ['Start date (required)', '2027-03-27'],
    ['End date (required)', '2027-03-30'], ['Number of travelers (required)', '2'],
    ['Budget per person (USD, required)', '750.50'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Food' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review trip details' }))
  expect(screen.getByRole('region', { name: 'Review your trip' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Destination (required)')).toHaveValue('Lisbon')
  expect(fetch).toHaveBeenCalledTimes(authRequests)
  expect(localWrite).not.toHaveBeenCalled()
})
