import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'

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
