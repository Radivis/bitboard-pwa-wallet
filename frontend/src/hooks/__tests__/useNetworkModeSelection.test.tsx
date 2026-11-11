import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { useNetworkModeSelection } from '@/hooks/useNetworkModeSelection'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

vi.mock('@/hooks/useDescriptorWalletSwitchMutation', () => ({
  useDescriptorWalletSwitchMutation: () => ({
    mutate,
    mutateAsync: vi.fn(),
    isSwitching: false,
    statusLine: null,
  }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), message: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

function NetworkSelectionHarness() {
  const { selectNetwork } = useNetworkModeSelection()
  return (
    <button type="button" onClick={() => selectNetwork('mainnet')}>
      Pick mainnet
    </button>
  )
}

describe('useNetworkModeSelection', () => {
  it('shows the mainnet toast and does not switch when mainnet access is off', async () => {
    useFeatureStore.setState({ isMainnetAccessEnabled: false })
    useWalletStore.setState({
      networkMode: 'testnet',
      activeWalletId: null,
      loadedDescriptorWallet: null,
    })
    const user = userEvent.setup()
    render(<NetworkSelectionHarness />)

    await user.click(screen.getByRole('button', { name: 'Pick mainnet' }))

    expect(toast.info).toHaveBeenCalledWith(
      'Activate Mainnet access in Settings → Features before selecting Mainnet.',
    )
    expect(mutate).not.toHaveBeenCalled()
  })
})
