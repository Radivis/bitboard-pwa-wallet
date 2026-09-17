import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWalletStore, AddressType } from '@/stores/walletStore'

const switchToLabNetwork = vi.fn()

vi.mock('@/lib/lab/switch-to-lab-network', () => ({
  switchToLabNetwork: (...args: unknown[]) => switchToLabNetwork(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { runLabRouteBeforeLoad } from '@/lib/lab/lab-route-before-load'

describe('runLabRouteBeforeLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      networkMode: 'testnet',
      walletStatus: 'unlocked',
      addressType: AddressType.Taproot,
      accountId: 0,
    })
    switchToLabNetwork.mockResolvedValue(true)
  })

  it('returns success without switching when already on lab', async () => {
    useWalletStore.setState({ networkMode: 'lab' })
    await expect(runLabRouteBeforeLoad()).resolves.toEqual({
      labAutoSwitchFailed: false,
    })
    expect(switchToLabNetwork).not.toHaveBeenCalled()
  })

  it('does not reject when the lab network switch throws', async () => {
    switchToLabNetwork.mockRejectedValue(undefined)
    await expect(runLabRouteBeforeLoad()).resolves.toEqual({
      labAutoSwitchFailed: true,
    })
  })
})
