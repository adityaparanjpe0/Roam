import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

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
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
