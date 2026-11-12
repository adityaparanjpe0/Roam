import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('the starter counter updates when activated', () => {
  render(<App />)

  const counter = screen.getByRole('button', { name: 'Count is 0' })
  fireEvent.click(counter)

  expect(counter).toHaveAccessibleName('Count is 1')
})
