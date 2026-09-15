import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  RouterOutletErrorBoundary,
  RouterSafeErrorBoundary,
} from '@/components/RouterSafeErrorBoundary'

const locationState = { pathname: '/lab' }

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useLocation: () => ({ pathname: locationState.pathname }),
  }
})

const rootSourceByPath = import.meta.glob('../../routes/__root.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function ThrowUndefined(): never {
  throw undefined
}

function ThrowError(): never {
  throw new Error('lab switch exploded')
}

function createThrowThenSucceed() {
  let shouldThrow = true
  function FlakyChild() {
    if (shouldThrow) {
      throw new Error('lab switch exploded')
    }
    return <p>route recovered</p>
  }
  return {
    FlakyChild,
    stopThrowing() {
      shouldThrow = false
    },
  }
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

  it('recovers after Try again when the child stops throwing', async () => {
    const user = userEvent.setup()
    const { FlakyChild, stopThrowing } = createThrowThenSucceed()
    render(
      <RouterSafeErrorBoundary>
        <FlakyChild />
      </RouterSafeErrorBoundary>,
    )
    expect(screen.getByText('lab switch exploded')).toBeInTheDocument()

    stopThrowing()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('route recovered')).toBeInTheDocument()
    expect(screen.queryByText('lab switch exploded')).not.toBeInTheDocument()
  })
})

describe('RouterOutletErrorBoundary', () => {
  beforeEach(() => {
    locationState.pathname = '/lab'
  })

  it('shows the next route after pathname changes', () => {
    const { rerender } = render(
      <RouterOutletErrorBoundary>
        <ThrowError />
      </RouterOutletErrorBoundary>,
    )
    expect(screen.getByText('lab switch exploded')).toBeInTheDocument()

    locationState.pathname = '/wallet'
    rerender(
      <RouterOutletErrorBoundary>
        <p>wallet route</p>
      </RouterOutletErrorBoundary>,
    )
    expect(screen.getByText('wallet route')).toBeInTheDocument()
    expect(screen.queryByText('lab switch exploded')).not.toBeInTheDocument()
  })
})

describe('root outlet error boundary wiring', () => {
  it('root outlet wraps with RouterOutletErrorBoundary', () => {
    const rootSource = Object.values(rootSourceByPath)[0]
    expect(rootSource).toContain('RouterOutletErrorBoundary')
    expect(rootSource).not.toMatch(
      /<\s*RouterSafeErrorBoundary[\s>]/,
    )
  })
})
