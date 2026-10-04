import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BarkSessionGate } from '@/components/bark/BarkSessionGate'

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  orchestrateBarkRetryLoad: vi.fn(),
}))

describe('BarkSessionGate', () => {
  it('shows the loading screen while the session is opening', () => {
    render(
      <BarkSessionGate loadPhase="loading" errorMessage={null}>
        <p>ready</p>
      </BarkSessionGate>,
    )

    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('shows the loading screen when Bark is not configured yet', () => {
    render(
      <BarkSessionGate loadPhase="not-configured" errorMessage={null}>
        <p>ready</p>
      </BarkSessionGate>,
    )

    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('shows the error screen when session open failed', () => {
    render(
      <BarkSessionGate loadPhase="load-error" errorMessage="server down">
        <p>ready</p>
      </BarkSessionGate>,
    )

    expect(
      screen.getByRole('heading', { name: 'Bark session could not be established' }),
    ).toBeInTheDocument()
    expect(screen.getByText('server down')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('renders children when the session is loaded', () => {
    render(
      <BarkSessionGate loadPhase="loaded" errorMessage={null}>
        <p>ready</p>
      </BarkSessionGate>,
    )

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-session-loading')).not.toBeInTheDocument()
  })
})
