import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'

describe('RailSyncControl', () => {
  it('shows spinner label when syncPhase is syncing', () => {
    render(
      <RailSyncControl
        rail="onchain"
        syncLabel="Sync on-chain"
        syncPhase="syncing"
        lastSyncedAt={null}
        onSync={vi.fn()}
      />,
    )

    expect(screen.getByTestId('rail-sync-onchain')).toHaveTextContent('Syncing…')
    expect(screen.getByTestId('rail-sync-onchain')).toBeDisabled()
  })

  it('shows last synced caption when timestamp is present', () => {
    render(
      <RailSyncControl
        rail="arkade"
        syncLabel="Sync Arkade"
        syncPhase="not-syncing"
        lastSyncedAt="2025-01-15T10:30:00.000Z"
        onSync={vi.fn()}
      />,
    )

    expect(screen.getByTestId('rail-sync-arkade-caption')).toHaveTextContent(
      'Last synced:',
    )
    expect(screen.getByTestId('rail-sync-arkade-caption')).toHaveAttribute(
      'data-rail-last-synced-at',
      '2025-01-15T10:30:00.000Z',
    )
  })

  it('keeps last synced caption while sync is pending', () => {
    render(
      <RailSyncControl
        rail="arkade"
        syncLabel="Sync Arkade"
        syncPhase="not-syncing"
        lastSyncedAt="2025-01-15T10:30:00.000Z"
        onSync={vi.fn()}
        isSyncPending
      />,
    )

    expect(screen.getByTestId('rail-sync-arkade')).toHaveTextContent('Syncing…')
    expect(screen.getByTestId('rail-sync-arkade-caption')).toHaveTextContent(
      'Last synced:',
    )
  })

  it('hides control when rail is not configured', () => {
    const { container } = render(
      <RailSyncControl
        rail="lightning"
        syncLabel="Sync Lightning"
        syncPhase="not-configured"
        lastSyncedAt={null}
        onSync={vi.fn()}
        railConfigured={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('calls onSync when clicked', async () => {
    const onSync = vi.fn()
    const user = userEvent.setup()
    render(
      <RailSyncControl
        rail="onchain"
        syncLabel="Sync on-chain"
        syncPhase="not-syncing"
        lastSyncedAt={null}
        onSync={onSync}
      />,
    )

    await user.click(screen.getByTestId('rail-sync-onchain'))
    expect(onSync).toHaveBeenCalledTimes(1)
  })
})
