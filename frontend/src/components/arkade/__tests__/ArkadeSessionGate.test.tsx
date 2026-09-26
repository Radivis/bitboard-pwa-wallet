import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArkadeSessionGate } from '@/components/arkade/ArkadeSessionGate'

describe('ArkadeSessionGate', () => {
  it('shows the loading screen while the session is opening', () => {
    render(
      <ArkadeSessionGate loadPhase="loading" errorMessage={null}>
        <p>ready</p>
      </ArkadeSessionGate>,
    )

    expect(screen.getByTestId('arkade-session-loading')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('shows the loading screen when Arkade is not configured yet', () => {
    render(
      <ArkadeSessionGate loadPhase="not-configured" errorMessage={null}>
        <p>ready</p>
      </ArkadeSessionGate>,
    )

    expect(screen.getByTestId('arkade-session-loading')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('shows the error screen when session open failed', () => {
    render(
      <ArkadeSessionGate loadPhase="load-error" errorMessage="operator down">
        <p>ready</p>
      </ArkadeSessionGate>,
    )

    expect(
      screen.getByRole('heading', { name: 'Arkade session could not be established' }),
    ).toBeInTheDocument()
    expect(screen.getByText('operator down')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('renders children when the session is loaded', () => {
    render(
      <ArkadeSessionGate loadPhase="loaded" errorMessage={null}>
        <p>ready</p>
      </ArkadeSessionGate>,
    )

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-session-loading')).not.toBeInTheDocument()
  })
})
