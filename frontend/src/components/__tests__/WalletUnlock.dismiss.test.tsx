import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { WalletUnlock } from '@/components/WalletUnlock'
import { AddressType, useWalletStore } from '@/stores/walletStore'

const navigateAwayFromWalletUnlockPrompt = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/lib/shared/app-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shared/app-router')>()
  return {
    ...actual,
    navigateAwayFromWalletUnlockPrompt: () => navigateAwayFromWalletUnlockPrompt(),
  }
})

vi.mock('@/db', () => ({
  useWallets: () => ({ data: [{ walletId: 1, name: 'Test Wallet', createdAt: '' }] }),
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', () => ({
  orchestrateManualUnlock: vi.fn(),
}))

describe('WalletUnlock dismiss', () => {
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

  it('navigates away from wallet unlock when the close button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WalletUnlock />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(navigateAwayFromWalletUnlockPrompt).toHaveBeenCalledTimes(1)
  })

  it('uses onDismiss instead of navigating away when provided', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<WalletUnlock onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(navigateAwayFromWalletUnlockPrompt).not.toHaveBeenCalled()
  })
})
