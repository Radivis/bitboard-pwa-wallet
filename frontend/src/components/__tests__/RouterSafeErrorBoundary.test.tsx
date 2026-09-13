import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterSafeErrorBoundary } from '@/components/RouterSafeErrorBoundary'

function ThrowUndefined(): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- reproduces TanStack redirected-match throw
  throw undefined
}

function ThrowError(): never {
  throw new Error('lab switch exploded')
}

describe('RouterSafeErrorBoundary', () => {
  it('renders a fallback when a child throws undefined', () => {
    render(
      <RouterSafeErrorBoundary>
        <ThrowUndefined />
      </RouterSafeErrorBoundary>,
    )
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })

  it('shows a real Error message', () => {
    render(
      <RouterSafeErrorBoundary>
        <ThrowError />
      </RouterSafeErrorBoundary>,
    )
    expect(screen.getByText('lab switch exploded')).toBeInTheDocument()
  })
})
