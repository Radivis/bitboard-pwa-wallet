import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignWalletDrawer, DESIGN_WALLET_DRAWER_ID } from '@/components/design/DesignWalletDrawer'
import {
  DRAWER_ENTER_FROM_TOP_CLASS,
  DRAWER_EXIT_TO_TOP_CLASS,
} from '@/components/design/use-drawer-presence'
import { useWalletStore } from '@/stores/walletStore'

const dbState = vi.hoisted(() => ({
  wallets: [
    { walletId: 1, name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' },
    { walletId: 2, name: 'Beta', createdAt: '2026-01-02T00:00:00.000Z' },
    {
      walletId: 3,
      name: 'A very long wallet name that should truncate',
      createdAt: '2026-01-03T00:00:00.000Z',
    },
  ],
}))

vi.mock('@/db', () => ({
  useWallets: () => ({ data: dbState.wallets }),
}))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

describe('DesignWalletDrawer', () => {
  beforeEach(() => {
    useWalletStore.setState({ activeWalletId: 1, walletStatus: 'unlocked' })
  })

  it('marks the active wallet and reports the wallet that was chosen', async () => {
    const user = userEvent.setup()
    const onSelectWallet = vi.fn()
    render(
      <DesignWalletDrawer open onOpen={vi.fn()} onClose={vi.fn()} onSelectWallet={onSelectWallet} />,
    )

    expect(screen.getByRole('dialog', { name: 'Select wallet' })).toBeInTheDocument()
    expect(screen.getByText('Select wallet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('data-status', 'selected')
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('data-status', 'default')
    expect(screen.getByText('A very long wallet name that should truncate')).toHaveClass('truncate')

    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['Alpha', 'Beta', 'A very long wallet name that should truncate'])

    await user.click(screen.getByRole('button', { name: 'Beta' }))
    expect(onSelectWallet).toHaveBeenCalledWith(2)
  })

  it('disables wallet choices while a switch is in flight', () => {
    render(
      <DesignWalletDrawer
        open
        isSwitching
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectWallet={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Alpha' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Beta' })).toBeDisabled()
  })

  it('enters from the top and retracts upward', async () => {
    const user = userEvent.setup()
    function ClosingDrawer() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            Close wallets
          </button>
          <DesignWalletDrawer
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            onSelectWallet={vi.fn()}
          />
        </>
      )
    }
    render(<ClosingDrawer />)

    const panel = screen.getByRole('dialog', { name: 'Select wallet' })
    expect(panel).toHaveAttribute('data-motion', 'enter')
    expect(panel).toHaveClass(DRAWER_ENTER_FROM_TOP_CLASS)

    await user.click(screen.getByRole('button', { name: 'Close wallets' }))

    const exitingPanel = document.getElementById(DESIGN_WALLET_DRAWER_ID)
    expect(exitingPanel).toHaveAttribute('data-motion', 'exit')
    expect(exitingPanel).toHaveClass(DRAWER_EXIT_TO_TOP_CLASS)
    expect(screen.queryByRole('dialog', { name: 'Select wallet' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(document.getElementById(DESIGN_WALLET_DRAWER_ID)).toBeNull()
    })
  })
})
