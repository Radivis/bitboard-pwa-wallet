import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { RailSyncWarningBanner } from '@/components/wallet/RailSyncWarningBanner'

describe('RailLoadErrorBanner', () => {
  it('renders when loadPhase is load-error', () => {
    render(
      <RailLoadErrorBanner
        rail="arkade"
        loadPhase="load-error"
        errorMessage="Session open failed"
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('wallet-load-error-banner-arkade')).toBeInTheDocument()
    expect(screen.getByText("Couldn't open Arkade session")).toBeInTheDocument()
    expect(screen.getByText('Session open failed')).toBeInTheDocument()
  })

  it('hides when loadPhase is not load-error', () => {
    render(
      <RailLoadErrorBanner
        rail="onchain"
        loadPhase="loaded"
        errorMessage="ignored"
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('wallet-load-error-banner-onchain')).not.toBeInTheDocument()
  })

  it('calls onRetry when Retry is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <RailLoadErrorBanner
        rail="lightning"
        loadPhase="load-error"
        errorMessage="Decrypt failed"
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('RailSyncErrorBanner', () => {
  it('renders when sync-error and load is loaded', () => {
    render(
      <RailSyncErrorBanner
        rail="onchain"
        syncPhase="sync-error"
        loadPhase="loaded"
        errorMessage="Esplora unreachable"
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('wallet-sync-error-banner-onchain')).toBeInTheDocument()
    expect(screen.getByText('On-chain sync failed')).toBeInTheDocument()
    expect(screen.getByText('Esplora unreachable')).toBeInTheDocument()
  })

  it('hides when load is not loaded', () => {
    render(
      <RailSyncErrorBanner
        rail="arkade"
        syncPhase="sync-error"
        loadPhase="loading"
        errorMessage="Operator down"
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('wallet-sync-error-banner-arkade')).not.toBeInTheDocument()
  })
})

describe('RailSyncWarningBanner', () => {
  it('renders when warning is set and load is loaded', () => {
    render(
      <RailSyncWarningBanner
        rail="arkade"
        syncPhase="not-syncing"
        loadPhase="loaded"
        warningMessage="Offchain receive keys could not be refreshed."
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('wallet-sync-warning-error-banner-arkade')).toBeInTheDocument()
    expect(screen.getByText('Arkade sync completed with warnings')).toBeInTheDocument()
    expect(screen.getByText('Offchain receive keys could not be refreshed.')).toBeInTheDocument()
  })

  it('hides when sync-error takes precedence', () => {
    render(
      <RailSyncWarningBanner
        rail="arkade"
        syncPhase="sync-error"
        loadPhase="loaded"
        warningMessage="stale warning"
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('wallet-sync-warning-error-banner-arkade')).not.toBeInTheDocument()
  })
})
