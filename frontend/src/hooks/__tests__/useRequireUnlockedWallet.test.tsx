import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRequireUnlockedWallet } from '@/hooks/useRequireUnlockedWallet'
import { useWalletStore, AddressType } from '@/stores/walletStore'

const orchestrateManualUnlock = vi.fn()

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: ({
    onUnlockSuccess,
    onDismiss,
  }: {
    onUnlockSuccess?: () => void
    onDismiss?: () => void
  }) => (
    <div data-testid="wallet-unlock-mock">
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
      <button type="button" onClick={onUnlockSuccess}>
        Unlock success
      </button>
    </div>
  ),
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', () => ({
  orchestrateManualUnlock: (...args: unknown[]) => orchestrateManualUnlock(...args),
}))

function Harness({ onAction }: { onAction: () => void }) {
  const { runWhenUnlocked, unlockDialog } = useRequireUnlockedWallet()
  return (
    <>
      <button type="button" onClick={() => runWhenUnlocked(onAction)}>
        Run action
      </button>
      {unlockDialog}
    </>
  )
}

describe('useRequireUnlockedWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'locked',
    })
  })

  it('runs action immediately when wallet is unlocked', async () => {
    useWalletStore.setState({ walletStatus: 'unlocked' })
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Harness onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Run action' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('wallet-unlock-mock')).not.toBeInTheDocument()
  })

  it('opens unlock dialog when wallet is locked', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Harness onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Run action' }))

    expect(screen.getByTestId('wallet-unlock-mock')).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('runs pending action after unlock success', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Harness onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Run action' }))
    await user.click(screen.getByRole('button', { name: 'Unlock success' }))

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1)
    })
  })
})
